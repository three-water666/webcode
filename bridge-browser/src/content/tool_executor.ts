import { BRANDING, isBootstrapOnlyToolName, PROTOCOL } from "@webcode/shared";
import type { SiteSelectors } from "../modules/config";
import * as UI from "../modules/ui";
import { i18n, t } from "../modules/i18n";
import { Logger } from "../modules/logger";
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

export class ToolExecutor {
  private readonly toolExecutionQueue: ToolExecutionPayload[] = [];
  private isToolExecutionQueueRunning = false;

  public constructor(private readonly options: ToolExecutorOptions) {}

  public execute(payload: ToolExecutionPayload): void {
    this.toolExecutionQueue.push(payload);
    void this.processToolExecutionQueue();
  }

  private async processToolExecutionQueue(): Promise<void> {
    if (this.isToolExecutionQueueRunning) {return;}

    this.isToolExecutionQueueRunning = true;
    try {
      while (this.toolExecutionQueue.length > 0) {
        const payload = this.toolExecutionQueue.shift();
        if (!payload) {continue;}

        try {
          await this.runQueuedTool(payload);
        } catch (error) {
          this.failQueuedTool(payload, error);
        }
      }
    } finally {
      this.isToolExecutionQueueRunning = false;
      if (this.toolExecutionQueue.length > 0) {
        void this.processToolExecutionQueue();
      }
    }
  }

  private async runQueuedTool(payload: ToolExecutionPayload): Promise<void> {
    if (payload.name === PROTOCOL.initToolName) {
      await this.initializeWebcode(payload);
      return;
    }

    if (isBootstrapOnlyToolName(payload.name)) {
      this.rejectBootstrapOnlyTool(payload);
      return;
    }

    if (!isPayloadApproved(payload, this.options.getApprovalState())) {
      Logger.log(`${t("hitl_intercept")}: ${payload.name}`, "warn");
      payload.request_id = payload.request_id ?? "unknown_id";
      const approved = await this.requestToolApproval(payload);
      if (!approved) {return;}
    }

    await this.performExecution(payload);
  }

  private failQueuedTool(payload: ToolExecutionPayload, error: unknown): void {
    const requestId = getRequestId(payload);
    const message = getErrorMessage(error) || "Tool execution failed.";
    this.options.requestRegistry.markSettled(requestId);
    Logger.log(`${t("exec_fail")}: ${message}`, "error");
    this.options.requestRegistry.saveToolResult(requestId, message, true);
    this.options.scheduleMainLoop(50);
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
      finalPrompt += `\n\n# Initialization Note\nFailed to fetch the tool or skill list. Re-run \`${PROTOCOL.initToolName}\` if needed.`;
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

          resolve(formatToolOutput(result.data, getInitToolFallback(name)));
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
  private performExecution(payload: ToolExecutionPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          { type: "EXECUTE_TOOL", payload },
          (response: unknown) => {
            const requestId = getRequestId(payload);
            this.options.requestRegistry.markSettled(requestId);

            if (chrome.runtime.lastError) {
              const errorMessage = chrome.runtime.lastError.message ?? "Tool execution failed.";
              Logger.log(`${t("exec_fail")}: ${errorMessage}`, "error");
              this.options.requestRegistry.saveToolResult(requestId, errorMessage, true);
              this.options.scheduleMainLoop(50);
              resolve();
              return;
            }

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
            resolve();
          }
        );
      } catch (error) {
        reject(toError(error));
      }
    });
  }

  private rejectBootstrapOnlyTool(payload: ToolExecutionPayload): void {
    const requestId = getRequestId(payload);
    const message = i18n.lang === "zh"
      ? [
        `工具 ${payload.name} 仅供 ${BRANDING.productName} 初始化使用，不能由模型直接调用。`,
        "请根据已初始化的工具和技能列表继续。",
      ].join("")
      : [
        `Tool ${payload.name} is reserved for ${BRANDING.productName} initialization and cannot be called directly by the model.`,
        " Continue with the initialized tool and skill lists.",
      ].join("");

    this.options.requestRegistry.markSettled(requestId);
    Logger.log(`${t("exec_fail")}: ${message}`, "error");
    this.options.requestRegistry.saveToolResult(requestId, message, true);
    this.options.scheduleMainLoop(50);
  }

  private requestToolApproval(payload: ToolExecutionPayload): Promise<boolean> {
    return new Promise((resolve) => {
      UI.showConfirmationModal(
        payload,
        (scope) => {
          this.focusInput();

          if (scope) {
            persistApprovalRule(payload, scope, this.options.getApprovalState());
            void chrome.storage.local.set({
              [`allowed_tools_${this.options.getWorkspaceId()}`]: buildStoredApprovalEntries(this.options.getApprovalState()),
            });
            Logger.log(`⚡ Approval saved for '${getApprovalLabel(payload, scope)}' in this workspace`, "action");
          }

          resolve(true);
        },
        (reason) => {
          const requestId = getRequestId(payload);
          this.options.requestRegistry.markSettled(requestId);
          this.focusInput();
          Logger.log(`${t("hitl_rejected")}: ${payload.name}`, "error");
          this.options.requestRegistry.saveToolResult(
            requestId,
            `User rejected execution. Reason: ${reason || "No reason provided."}`,
            true
          );
          this.options.scheduleMainLoop(50);
          resolve(false);
        }
      );
    });
  }

  private focusInput(): void {
    const selectors = this.options.getSelectors();
    if (!selectors) {return;}

    UI.focusInputArea(selectors);
  }
}

function escapeInlineNewlines(value: string): string {
  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function formatSuccessfulResult(toolName: string, data: unknown): string {
  return formatToolOutput(data, getToolResultFallback(toolName));
}

function formatToolOutput(data: unknown, fallback: string): string {
  return stringifyToolData(data, fallback);
}

function getInitToolFallback(toolName: string): string {
  // Initialization asks for a prompt fragment plus JSON-like tool/skill lists.
  return toolName === "get_project_rules" ? "" : "[]";
}

function getToolResultFallback(_toolName: string): string {
  return "";
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
