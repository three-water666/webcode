import { BRANDING, PROTOCOL } from "@webcode/shared";
import type { SiteSelectors } from "../modules/config";
import type { CommandApprovalScope } from "../modules/ui";
import * as UI from "../modules/ui";
import { Logger, i18n, t } from "../modules/utils";
import type { ToolExecutionPayload } from "../types";
import {
  buildStoredApprovalEntries,
  getApprovalLabel,
  isPayloadApproved,
  persistApprovalRule,
  type ApprovalState,
} from "./approval_policy";
import { type ToolRequestRegistry } from "./tool_request_registry";

interface ToolExecutorOptions {
  getSelectors: () => SiteSelectors | null;
  getWorkspaceId: () => string;
  getApprovalState: () => ApprovalState;
  requestRegistry: ToolRequestRegistry;
  scheduleMainLoop: (delayMs: number) => void;
}

interface ToolExecutionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

interface ToolGroup {
  server?: unknown;
  tools?: unknown;
  [key: string]: unknown;
}

export class ToolExecutor {
  private readonly confirmationQueue: ToolExecutionPayload[] = [];
  private isPopupOpen = false;

  public constructor(private readonly options: ToolExecutorOptions) {}

  public execute(payload: ToolExecutionPayload): void {
    if (payload.name === PROTOCOL.initToolName) {
      void this.initializeWebcode(payload);
      return;
    }

    if (payload.name === "task_completion_notification") {
      this.finishVirtualTool(payload);
      return;
    }

    if (!isPayloadApproved(payload, this.options.getApprovalState())) {
      Logger.log(`${t("hitl_intercept")}: ${payload.name}`, "warn");
      payload.request_id = payload.request_id ?? "unknown_id";
      this.confirmationQueue.push(payload);
      this.processConfirmationQueue();
      return;
    }

    this.performExecution(payload);
  }

  /**
   * 执行客户端侧的初始化虚拟工具，并在结果准备好后调度主循环回填。
   *
   * 初始化工具不会走远端普通工具的完整回调链，它会在这里聚合项目规则、工具列表和技能列表，
   * 然后直接写入 request registry。由于 registry 状态变化本身不会触发页面 DOM 变化，必须在
   * 状态写完后调用 scheduleMainLoop，让主循环发现该 request_id 已完成并把初始化内容写回输入框。
   */
  private async initializeWebcode(payload: ToolExecutionPayload): Promise<void> {
    const requestId = getRequestId(payload);
    let finalPrompt = i18n.lang === "zh"
      ? `以下是 ${PROTOCOL.initToolName} 的返回结果，请不要再次发送 ${PROTOCOL.initToolName} 初始化命令。\n\n`
      : `The following is the result returned by ${PROTOCOL.initToolName}. Do not send the ${PROTOCOL.initToolName} initialization command again.\n\n`;
    finalPrompt += i18n.resources.prompt ?? "";

    Logger.log(`Initializing ${BRANDING.productName} with prompt, project rules, tool list, and skill list`, "action");

    try {
      const projectRules = (await this.executeInitToolCall("get_project_rules")).trim();
      if (projectRules) {
        finalPrompt += `\n\n${projectRules}`;
      }
    } catch (error) {
      Logger.log(`Project rules fetch failed: ${getErrorMessage(error)}`, "error");
    }

    try {
      const [toolsResult, skillsResult] = await Promise.all([
        this.executeInitToolCall("list_tools"),
        this.executeInitToolCall("list_skills"),
      ]);

      finalPrompt += `\n\n# Available Tools\n\`\`\`json\n${escapeInlineNewlines(toolsResult)}\n\`\`\``;
      finalPrompt += `\n\n# Available Skills\n\`\`\`json\n${escapeInlineNewlines(skillsResult)}\n\`\`\``;
    } catch (error) {
      Logger.log(`Initialization data fetch failed: ${getErrorMessage(error)}`, "error");
      finalPrompt += `\n\n# Initialization Note\nFailed to fetch the tool or skill list. Call \`list_tools\` or \`list_skills\` manually if needed.`;
    }

    this.options.requestRegistry.saveRawResult(requestId, finalPrompt);
    this.options.requestRegistry.markSettled(requestId);
    // 给当前调用栈一点时间收尾，再让主循环批处理回填，和普通工具完成路径保持一致。
    this.options.scheduleMainLoop(50);
  }

  private executeInitToolCall(name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "EXECUTE_TOOL",
          payload: { name, arguments: {} },
        },
        (response: unknown) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          const result = normalizeToolResponse(response);
          if (!result.success) {
            reject(new Error(result.error ?? `Failed to execute ${name}`));
            return;
          }

          resolve(stringifyToolData(result.data, "[]"));
        }
      );
    });
  }

  /**
   * 发送真实工具调用到扩展后台，并在后台响应后调度主循环回填。
   *
   * 后台工具执行完成时，content script 只会收到这个回调；页面 DOM 不会因为 registry 更新
   * 自动变化。这里先把 request_id 标记为已结束，再把成功或失败结果写入 registry，
   * 最后通过 scheduleMainLoop 通知主循环重新计算当前轮次是否已经全部完成。
   */
  private performExecution(payload: ToolExecutionPayload): void {
    chrome.runtime.sendMessage(
      { type: "EXECUTE_TOOL", payload },
      (response: unknown) => {
        const requestId = getRequestId(payload);
        this.options.requestRegistry.markSettled(requestId);

        const result = normalizeToolResponse(response);
        if (result.success) {
          Logger.log(`${t("exec_success")}: ${payload.name}`, "success");
          const outputContent = formatSuccessfulResult(payload.name, result.data);
          this.options.requestRegistry.saveToolResult(requestId, outputContent);
        } else {
          Logger.log(`${t("exec_fail")}: ${result.error}`, "error");
          this.options.requestRegistry.saveToolResult(requestId, result.error ?? "Tool execution failed.", true);
        }

        // 工具完成不会触发 MutationObserver，需要主动安排一次扫描来推动批量回填。
        this.options.scheduleMainLoop(50);
      }
    );
  }

  private finishVirtualTool(payload: ToolExecutionPayload): void {
    const requestId = getRequestId(payload);
    const msg = getPayloadMessage(payload) ?? "Task Completed";
    Logger.log(`🔔 Notification: ${msg}`, "action");
    void chrome.runtime.sendMessage({
      type: "SHOW_NOTIFICATION",
      title: `${BRANDING.productName} Task Finished`,
      message: msg,
    });
    this.options.requestRegistry.markSettled(requestId);
    this.options.requestRegistry.saveRawResult(requestId, "");
  }

  private processConfirmationQueue(): void {
    if (this.isPopupOpen || this.confirmationQueue.length === 0) {return;}

    while (this.confirmationQueue.length > 0 && isPayloadApproved(this.confirmationQueue[0], this.options.getApprovalState())) {
      const approvedPayload = this.confirmationQueue.shift();
      if (!approvedPayload) {return;}
      Logger.log(`Approval already saved for '${getApprovalLabel(approvedPayload)}'; skipping confirmation`, "action");
      this.performExecution(approvedPayload);
    }

    if (this.confirmationQueue.length === 0) {return;}
    this.showNextConfirmation();
  }

  private showNextConfirmation(): void {
    const payload = this.confirmationQueue[0];
    if (!payload) {return;}
    this.isPopupOpen = true;

    UI.showConfirmationModal(
      payload,
      (scope) => this.confirmExecution(payload, scope),
      (reason) => this.rejectExecution(payload, reason)
    );
  }

  private confirmExecution(payload: ToolExecutionPayload, scope: CommandApprovalScope): void {
    this.confirmationQueue.shift();
    this.isPopupOpen = false;
    this.focusInput();

    if (scope) {
      persistApprovalRule(payload, scope, this.options.getApprovalState());
      void chrome.storage.local.set({
        [`allowed_tools_${this.options.getWorkspaceId()}`]: buildStoredApprovalEntries(this.options.getApprovalState()),
      });
      Logger.log(`⚡ Approval saved for '${getApprovalLabel(payload, scope)}' in this workspace`, "action");
    }

    this.performExecution(payload);
    this.processConfirmationQueue();
  }

  private rejectExecution(payload: ToolExecutionPayload, reason: string): void {
    this.confirmationQueue.shift();
    this.isPopupOpen = false;
    this.options.requestRegistry.markSettled(getRequestId(payload));
    this.focusInput();
    Logger.log(`${t("hitl_rejected")}: ${payload.name}`, "error");
    this.options.requestRegistry.saveToolResult(
      getRequestId(payload),
      `User rejected execution. Reason: ${reason || "No reason provided."}`,
      true
    );
    this.processConfirmationQueue();
  }

  private focusInput(): void {
    const selectors = this.options.getSelectors();
    if (!selectors) {return;}

    const inputEl = document.querySelector<HTMLElement>(selectors.inputArea);
    inputEl?.focus();
  }
}

function escapeInlineNewlines(value: string): string {
  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function formatSuccessfulResult(toolName: string, data: unknown): string {
  const finalData = stringifyToolData(data, "");
  if (toolName !== "list_tools") {
    return finalData;
  }

  try {
    return injectClientTools(finalData);
  } catch (error) {
    console.error("Tool list processing error", error);
    return finalData;
  }
}

function injectClientTools(toolListJson: string): string {
  const parsed: unknown = JSON.parse(toolListJson);
  if (!Array.isArray(parsed)) {
    return toolListJson;
  }

  if (!parsed.every(isToolGroup)) {
    return toolListJson;
  }

  const groups = parsed;
  const clientGroup = getClientGroup(groups);
  clientGroup.tools.push({
    name: "task_completion_notification",
    description:
      "Notify the user that a long-running task or a series of complex operations is complete. Use this when you need the user's attention to review your work or provide new instructions. Calling this will trigger a system notification on the user's device.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  });

  return JSON.stringify(groups, null, 2);
}

function getClientGroup(groups: ToolGroup[]): ToolGroup & { tools: unknown[] } {
  let clientGroup = groups.find((group) => group.server === "client");
  if (!clientGroup) {
    clientGroup = { server: "client", tools: [] };
    groups.push(clientGroup);
  }

  if (!Array.isArray(clientGroup.tools)) {
    clientGroup.tools = [];
  }

  return clientGroup as ToolGroup & { tools: unknown[] };
}

function normalizeToolResponse(response: unknown): ToolExecutionResponse {
  if (!isRecord(response)) {
    return {
      success: false,
      error: "Tool execution failed.",
    };
  }

  return {
    success: response.success === true,
    error: typeof response.error === "string" ? response.error : undefined,
    data: response.data,
  };
}

function stringifyToolData(data: unknown, fallback: string): string {
  if (typeof data === "string") {return data;}
  if (data == null) {return fallback;}
  const json = JSON.stringify(data, null, 2);
  if (typeof json === "string") {return json;}
  if (typeof data === "number" || typeof data === "boolean" || typeof data === "bigint") {
    return String(data);
  }
  return fallback;
}

function getRequestId(payload: ToolExecutionPayload): string {
  return payload.request_id ?? "unknown_id";
}

function getPayloadMessage(payload: ToolExecutionPayload): string | null {
  const args: unknown = payload.arguments;
  if (!isRecord(args)) {return null;}
  const message = args.message;
  return typeof message === "string" ? message : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isToolGroup(value: unknown): value is ToolGroup {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
