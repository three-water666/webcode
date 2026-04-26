import { Logger, i18n, t } from "../modules/utils";
import * as UI from "../modules/ui";
import { type SiteSelectors } from "../modules/config";
import { type ToolExecutionPayload } from "../types";
import type { CommandApprovalScope } from "../modules/ui";
import { BRANDING, PROTOCOL } from "@webcode/shared";

// === 配置与状态 ===
interface ConfigState {
  pollInterval: number;
  autoSend: boolean;
}

const CONFIG: ConfigState = {
  pollInterval: 1000,
  autoSend: true,
};

// [State] Connection Guard
let isClientConnected = false;
let currentWorkspaceId = "global";

let allowedTools = new Set<string>();
let allowedCommandRules = new Set<string>();
const confirmationQueue: ToolExecutionPayload[] = [];
let isPopupOpen = false;
const COMMAND_APPROVAL_TOOLS = new Set(["execute_command", "run_in_terminal"]);

// === 加载资源 (Prompt/Hints) ===
const lang = i18n.lang;
const promptKey = lang === "zh" ? "prompt_zh" : "prompt_en";
const trainKey = lang === "zh" ? "train_zh" : "train_en";
const errorKey = lang === "zh" ? "error_hint_zh" : "error_hint_en";
const initKey = lang === "zh" ? "init_zh" : "init_en";
const oversizeKey = lang === "zh" ? "oversize_zh" : "oversize_en";

function loadPromptsFromStorage(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([promptKey, trainKey, errorKey, initKey, oversizeKey], (items) => {
      if (items[promptKey]) { i18n.resources.prompt = items[promptKey]; }
      if (items[trainKey]) { i18n.resources.train = items[trainKey]; }
      if (items[errorKey]) { i18n.resources.error = items[errorKey]; }
      if (items[initKey]) { i18n.resources.init = items[initKey]; }
      if (items[oversizeKey]) { i18n.resources.oversize = items[oversizeKey]; }
      resolve();
    });
  });
}

function loadWorkspaceData(workspaceId: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([`allowed_tools_${workspaceId}`], (localItems) => {
      const rawEntries = localItems[`allowed_tools_${workspaceId}`] ?? [];
      allowedTools = new Set<string>();
      allowedCommandRules = new Set<string>();

      for (const entry of rawEntries) {
        if (typeof entry !== "string") {continue;}
        if (entry.startsWith("command:")) {
          allowedCommandRules.add(upgradeLegacyCommandRule(entry));
        } else if (entry.startsWith("tool:")) {
          allowedTools.add(entry.slice("tool:".length));
        } else {
          allowedTools.add(entry);
        }
      }

      resolve();
    });
  });
}

// Initially load prompts from local storage in case we are already connected
loadPromptsFromStorage();
// Load default workspace data
loadWorkspaceData(currentWorkspaceId);

// 监听消息 (日志开关 & 状态同步)
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "TOGGLE_LOG") {
    Logger.toggle(request.show);
    Logger.log("Logger Visible: " + request.show, "info");
  }
  if (request.type === "STATUS_UPDATE") {
    const wasConnected = isClientConnected;
    isClientConnected = request.connected;

    const wasWorkspaceId = currentWorkspaceId;
    if (request.workspaceId) {
      currentWorkspaceId = request.workspaceId;
    }

    if (isClientConnected !== wasConnected) {
      Logger.log(`[MCP] Connection Status: ${isClientConnected ? "Connected" : "Disconnected"}`, "info");
    }

    if (isClientConnected && (isClientConnected !== wasConnected || currentWorkspaceId !== wasWorkspaceId)) {
      (async () => {
        // Fetch the workspace-specific allowed tools
        await loadWorkspaceData(currentWorkspaceId);

        // Re-load prompts from local
        await loadPromptsFromStorage();

        // Re-activate immediately
        runMainLoop();
      })();
    }
  }
});

// === DOM 选择器与配置 ===
let DOM: SiteSelectors | null = null;
let currentPlatform: string | null = null;
let autoInitListenerStarted = false;
let autoInitModalOpen = false;
let lastAutoInitPromptedText = "";

const AUTO_INIT_TRIGGER_TOKEN_RE = /(?:\/webcode|@webcode)(?=$|[\s\n.,，。!?！？:：;；])/gi;
const AUTO_INIT_INVALID_PREFIX_RE = /[A-Za-z0-9_/@.]/;
const AUTO_INIT_IGNORABLE_PREFIX_RE = /[\s\u00a0\uFEFF\u200B]/;

function findAutoInitTrigger(text: string): { replacementStart: number; end: number } | null {
  AUTO_INIT_TRIGGER_TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = AUTO_INIT_TRIGGER_TOKEN_RE.exec(text)) !== null) {
    const tokenStart = match.index;
    const previousChar = tokenStart > 0 ? text[tokenStart - 1] : "";

    if (AUTO_INIT_INVALID_PREFIX_RE.test(previousChar)) {
      continue;
    }

    let replacementStart = tokenStart;
    while (replacementStart > 0 && AUTO_INIT_IGNORABLE_PREFIX_RE.test(text[replacementStart - 1])) {
      replacementStart--;
    }

    return {
      replacementStart,
      end: tokenStart + match[0].length,
    };
  }

  return null;
}

function initDOMConfig() {
  chrome.storage.sync.get(
    ["autoSend"],
    (items) => {
      CONFIG.autoSend = items.autoSend ?? true;

      chrome.storage.local.get(["syncedAiSites"], (localItems) => {
        const sites = localItems.syncedAiSites ?? [];
        const currentUrl = location.href;

        // Find matching site by URL prefix
        const matchedSite = sites.find((site: any) => currentUrl.startsWith(site.address));

        if (matchedSite?.selectors) {
          DOM = matchedSite.selectors;
          currentPlatform = matchedSite.name;
          setupAutoInitTrigger();
          startObserver();
        } else {
          console.log(`${BRANDING.productName}: Current site is not configured in VS Code. Idle.`);
        }
      });
    }
  );
}

function setupAutoInitTrigger() {
  if (autoInitListenerStarted) {return;}
  autoInitListenerStarted = true;

  const scheduleCheck = () => {
    setTimeout(() => {
      void maybePromptAutoInit();
    }, 0);
  };

  document.addEventListener("input", scheduleCheck, true);
  document.addEventListener("keyup", scheduleCheck, true);
  document.addEventListener("paste", scheduleCheck, true);
}

async function maybePromptAutoInit() {
  if (!DOM || !isClientConnected || autoInitModalOpen) {return;}

  const inputEl = document.querySelector<HTMLElement>(DOM.inputArea);
  if (!inputEl || !isActiveInput(inputEl)) {return;}

  const currentText = getInputText(inputEl);
  const currentTrigger = findAutoInitTrigger(currentText);
  if (!currentTrigger) {return;}
  if (currentText === lastAutoInitPromptedText) {return;}

  if (!i18n.resources.init) {
    await loadPromptsFromStorage();
  }
  const initPrompt = i18n.resources.init;
  if (!initPrompt) {return;}

  lastAutoInitPromptedText = currentText;
  autoInitModalOpen = true;
  const confirmed = await UI.showAutoInitConfirm();
  autoInitModalOpen = false;

  if (!confirmed || !DOM) {return;}

  const latestInput = document.querySelector<HTMLElement>(DOM.inputArea);
  if (!latestInput) {return;}

  const latestText = getInputText(latestInput);
  const latestTrigger = findAutoInitTrigger(latestText);
  if (!latestTrigger) {return;}

  const beforeTrigger = latestText.slice(0, latestTrigger.replacementStart);
  const afterTrigger = latestText.slice(latestTrigger.end);
  const prefix = beforeTrigger.trim() ? "\n\n" : "";
  const replacement = `${beforeTrigger}${prefix}${initPrompt.trim()}\n\n${afterTrigger}`;

  if (UI.replaceInputBoxText(replacement, DOM.inputArea)) {
    lastAutoInitPromptedText = replacement;
    Logger.log("Inserted webcode initialization prompt", "action");
  }
}

function isActiveInput(inputEl: HTMLElement): boolean {
  const activeEl = document.activeElement;
  return activeEl === inputEl || Boolean(activeEl) && inputEl.contains(activeEl);
}

function getInputText(inputEl: HTMLElement | HTMLInputElement | HTMLTextAreaElement): string {
  return (inputEl as HTMLInputElement).value ?? inputEl.innerText ?? "";
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync") {
    if (changes.autoSend) { CONFIG.autoSend = changes.autoSend.newValue; }
  }
  if (namespace === "local") {
    if (changes[`allowed_tools_${currentWorkspaceId}`]) {
      const rawEntries = changes[`allowed_tools_${currentWorkspaceId}`].newValue ?? [];
      allowedTools = new Set<string>();
      allowedCommandRules = new Set<string>();
      for (const entry of rawEntries) {
        if (typeof entry !== "string") {continue;}
        if (entry.startsWith("command:")) {
          allowedCommandRules.add(upgradeLegacyCommandRule(entry));
        } else if (entry.startsWith("tool:")) {
          allowedTools.add(entry.slice("tool:".length));
        } else {
          allowedTools.add(entry);
        }
      }
      Logger.log(`Allowed tools updated (Workspace: ${currentWorkspaceId})`, "action");
    }
    if (changes.syncedAiSites) {
      initDOMConfig();
      Logger.log(t("config_updated"), "action");
    }
    if (changes[promptKey] || changes[trainKey] || changes[errorKey] || changes[initKey] || changes[oversizeKey]) {
      loadPromptsFromStorage();
    }
  }
});

// === 主循环逻辑 ===

// 正则表达式匹配常见的非标准空白字符，包括不间断空格 (\u00a0)
const nonStandardSpaces = /[\u00a0\uFEFF\u200B]/g;
// 记录所有出现request_id，从而判断是不是新的工具请求
const processedRequests = new Set<string>();
// 记录所有工具调用结果回填的 request_id
const flushedRequests = new Set<string>();
// 主要用来储存解析失败的JSON块信息，流式输出过程中可能解析失败，只提示真正失败的
const blockStates = new WeakMap<
  Element,
  { text: string; time: number; errorNotified: boolean }
>();
// 缓存request_id和工具调用结果
const resultBuffer = new Map<string, string>();
// 记录正在执行的工具的request_id
const activeExecutions = new Set<string>();
const STABILIZATION_TIMEOUT = 3000;
let toolCallCount = 0;
let lastProgressLogTime = 0;
let lastProgressStatus = "";

// === 性能优化: MutationObserver 取代 setInterval ===
let isCheckScheduled = false;

function runMainLoop() {

  isCheckScheduled = false;
  if (!DOM || !isClientConnected) { return; }
  // 所有大模型的消息块
  const messages = document.querySelectorAll(DOM.messageBlocks);
  if (messages.length === 0) { return; }

  // 只处理最后一次大模型返回的消息块
  const lastMessage = messages[messages.length - 1];
  // 找到大模型最后一次返回的消息快中所有JSON块
  const codeElements = lastMessage.querySelectorAll(DOM.codeBlocks);
  // 记录大模型最后一次返回的消息块的所有JSON块中的request_id
  const currentTurnIds: string[] = [];

  codeElements.forEach((codeEl) => {
    const textContent = (codeEl.textContent ?? "").trim();
    if (!/"mcp_action"\s*:\s*"call"/.test(textContent)) { return; }

    // 核心修复: 清理非标准空白字符 (如不间断空格 \u00a0)，以防止 JSON.parse 失败。
    const cleanedText = textContent.replace(nonStandardSpaces, ' ');

    try {
      const payload = JSON.parse(cleanedText);
      if (blockStates.has(codeEl)) { blockStates.delete(codeEl); }

      // 成功解析 JSON，尝试清除旧的错误样式（如果存在）
      if ((codeEl as HTMLElement).dataset.mcpState === "error") {
        (codeEl as HTMLElement).style.border = "none";
        delete (codeEl as HTMLElement).dataset.mcpState;
      }

      if (payload.mcp_action === "call") {
        if (!payload.request_id) {
          const el = codeEl as HTMLElement;
          el.dataset.mcpRequestId ??= "req_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
          payload.request_id = el.dataset.mcpRequestId;
        }
        currentTurnIds.push(payload.request_id);

        const isProcessing = activeExecutions.has(payload.request_id);
        const isKnown = processedRequests.has(payload.request_id);

        if (!isKnown) {
          // === Case 1: 新发现的任务 ===
          processedRequests.add(payload.request_id);
          activeExecutions.add(payload.request_id);

          // [Fix 2] 发现新任务，立即中断任何正在进行的自动发送尝试
          UI.cancelAutoSend();

          // 立即标记为处理中 (Blue)
          UI.markVisualProcessing(codeEl as HTMLElement);

          Logger.log(`${t("captured")}: ${payload.name}`, "info");
          executeTool(payload);
        } else {
          // === Case 2: 已知任务，更新视觉状态 ===
          if (isProcessing) {
            // 仍在执行或等待审批 -> 蓝色
            UI.markVisualProcessing(codeEl as HTMLElement);
          } else {
            // 已从 activeExecutions 移除 (执行完成/失败/被拒) -> 绿色
            UI.markVisualSuccess(codeEl as HTMLElement);
          }
        }
      }
    } catch (e: any) {
      // JSON Stabilization Logic
      const now = Date.now();
      const state = blockStates.get(codeEl);
      if (state?.text !== textContent) {
        blockStates.set(codeEl, {
          text: textContent,
          time: now,
          errorNotified: false,
        });
        if ((codeEl as HTMLElement).dataset.mcpState === "error") {
          (codeEl as HTMLElement).style.border = "none";
          delete (codeEl as HTMLElement).dataset.mcpState;
          delete (codeEl as HTMLElement).dataset.mcpVisual;
        }
      } else {
        if (now - state.time > STABILIZATION_TIMEOUT && !state.errorNotified) {
          Logger.log("JSON Parse Error (Stable): " + e.message, "error");
          UI.markVisualError(codeEl as HTMLElement);
          chrome.runtime.sendMessage({
            type: "SHOW_NOTIFICATION",
            title: `${BRANDING.productName} Error`,
            message: "Invalid JSON format (Stuck).",
          });
          state.errorNotified = true;
          blockStates.set(codeEl, state);
        }
      }
    }
  });

  // 批处理队列
  // 还没回填的request_id
  const actionableIds = currentTurnIds.filter((id) => !flushedRequests.has(id));

  if (actionableIds.length > 0) {
    // 完成数
    const completedCount = actionableIds.filter(
      (id) => !activeExecutions.has(id) && resultBuffer.has(id)
    ).length;

    // 总数
    const totalCount = actionableIds.length;

    // [Fix 3] 只要所有已知工具完成（且通过下方的 Stop 按钮检查），即可尝试发送
    if (completedCount === totalCount) {
      // [Fix 4] Double Check: 页面上是否有 Stop 按钮？
      const stopBtn = DOM.stopButton
        ? document.querySelector(DOM.stopButton)
        : null;
      if (stopBtn) {
        // AI 还在忙，推迟发送。但由于 AI 停止时可能不触发 DOM 变化，安排一个稍后的检查
        if (!isCheckScheduled) {
          isCheckScheduled = true;
          setTimeout(runMainLoop, 1000);
        }
        return;
      }

      const orderedResults: string[] = [];
      let hasUnflushedContent = false;
      actionableIds.forEach((id) => {
        const res = resultBuffer.get(id);
        if (res) {
          orderedResults.push(res);
          hasUnflushedContent = true;
        }
      });

      if (hasUnflushedContent && DOM) {
        const selectors = DOM;
        Logger.log(
          `Batch finished: ${orderedResults.length} tools. Writing...`,
          "success"
        );
        // 回填
        const finalOutput = orderedResults.join("\n\n");
        actionableIds.forEach((id) => {
          resultBuffer.delete(id);
          flushedRequests.add(id);
        });
        void UI.deliverResult(finalOutput, selectors).then(() => {
          UI.triggerAutoSend(CONFIG, selectors);
        });
      } else {
        // 纯虚拟工具（无输出）
        const anyVirtual = actionableIds.some((id) => resultBuffer.has(id));
        if (anyVirtual) {
          actionableIds.forEach((id) => {
            resultBuffer.delete(id);
            flushedRequests.add(id);
          });
        }
      }
      lastProgressStatus = "";
    } else {
      // 等待中...
      const statusStr = `${completedCount}/${totalCount}`;
      const now = Date.now();
      if (
        statusStr !== lastProgressStatus ||
        now - lastProgressLogTime > 3000
      ) {
        Logger.log(`${t("waiting_tools")} (${statusStr})`, "warn");
        lastProgressStatus = statusStr;
        lastProgressLogTime = now;
      }
    }
  }
}

// 初始化观察者
const observer = new MutationObserver(() => {
  if (!isClientConnected) { return; }

  // 简单节流：如果已经计划了下一次检查，就不重复计划
  // 这样保证在高频刷新（AI打字）时，最多每 CONFIG.pollInterval 执行一次
  if (!isCheckScheduled) {
    isCheckScheduled = true;
    setTimeout(runMainLoop, CONFIG.pollInterval);
  }
});

function startObserver() {
  if (!currentPlatform || !DOM) {return;}
  // Initialize observer only once
  if ((window as any)[PROTOCOL.observerStartedFlag]) {return;}
  (window as any)[PROTOCOL.observerStartedFlag] = true;

  // 1. Start observing immediately (but logic inside is guarded by isClientConnected)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // 2. Check initial status
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, async (response) => {
    if (response?.connected) {
      isClientConnected = true;
      if (response.workspaceId) {
        currentWorkspaceId = response.workspaceId;
        await loadWorkspaceData(currentWorkspaceId);
      }
      await loadPromptsFromStorage();
      Logger.log(`${BRANDING.productName} activated for ${currentPlatform} (Connected)`, "info");
      runMainLoop();
    } else {
      isClientConnected = false;
      console.log(`${BRANDING.productName} loaded for ${currentPlatform} (Disconnected - Idle)`);
      // Optional: Inform user that connection is missing
    }
  });
}

initDOMConfig();

// === 执行工具 ===
function executeTool(payload: ToolExecutionPayload) {
  // 虚拟工具：系统初始化
  if (payload.name === PROTOCOL.initToolName) {
    void initializeWebcode(payload);
    return;
  }

  // 虚拟工具：任务完成通知
  if (payload.name === "task_completion_notification") {
    finishVirtualTool(payload);
    return;
  }

  if (!isPayloadApproved(payload)) {
    Logger.log(`${t("hitl_intercept")}: ${payload.name}`, "warn");
    (payload as any).request_id = (payload as any).request_id ?? "unknown_id";
    confirmationQueue.push(payload);
    processConfirmationQueue();
    return;
  }

  performExecution(payload);
}

async function initializeWebcode(payload: ToolExecutionPayload) {
  const requestId = payload.request_id ?? "unknown_id";
  let finalPrompt = i18n.lang === "zh"
    ? `以下是 ${PROTOCOL.initToolName} 的返回结果，请不要再次发送 ${PROTOCOL.initToolName} 初始化命令。\n\n`
    : `The following is the result returned by ${PROTOCOL.initToolName}. Do not send the ${PROTOCOL.initToolName} initialization command again.\n\n`;
  finalPrompt += i18n.resources.prompt ?? "";

  Logger.log(`Initializing ${BRANDING.productName} with prompt, project rules, tool list, and skill list`, "action");

  try {
    const projectRules = (await executeInitToolCall("get_project_rules")).trim();
    if (projectRules) {
      finalPrompt += `\n\n${projectRules}`;
    }
  } catch (error: any) {
    Logger.log(`Project rules fetch failed: ${error.message}`, "error");
  }

  try {
    const [toolsResult, skillsResult] = await Promise.all([
      executeInitToolCall("list_tools"),
      executeInitToolCall("list_skills")
    ]);

    finalPrompt += `\n\n# Available Tools\n\`\`\`json\n${escapeInlineNewlines(toolsResult)}\n\`\`\``;
    finalPrompt += `\n\n# Available Skills\n\`\`\`json\n${escapeInlineNewlines(skillsResult)}\n\`\`\``;
  } catch (error: any) {
    Logger.log(`Initialization data fetch failed: ${error.message}`, "error");
    finalPrompt += `\n\n# Initialization Note\nFailed to fetch the tool or skill list. Call \`list_tools\` or \`list_skills\` manually if needed.`;
  }

  resultBuffer.set(requestId, finalPrompt);
  activeExecutions.delete(requestId);
  setTimeout(runMainLoop, 50);
}

function escapeInlineNewlines(value: string): string {
  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function executeInitToolCall(name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "EXECUTE_TOOL",
        payload: { name, arguments: {} }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.success) {
          reject(new Error(response?.error ?? `Failed to execute ${name}`));
          return;
        }

        resolve(String(response.data ?? "[]"));
      }
    );
  });
}

function performExecution(payload: any) {
  chrome.runtime.sendMessage(
    { type: "EXECUTE_TOOL", payload: payload },
    (response) => {
      activeExecutions.delete(payload.request_id);
      let outputContent = "";
      if (response?.success) {
        Logger.log(`${t("exec_success")}: ${payload.name}`, "success");
        let finalData = response.data;
        if (payload.name === "list_tools") {
          try {
            const groups = JSON.parse(finalData);

            // 1. Inject Virtual Client Tools
            let clientGroup = groups.find((g: any) => g.server === "client");
            if (!clientGroup) {
              clientGroup = { server: "client", tools: [], hidden_tools: [] };
              groups.push(clientGroup);
            }
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

            // 2. Update Output
            finalData = JSON.stringify(groups, null, 2);
          } catch (e) {
            console.error("Tool list processing error", e);
          }
        }
        outputContent = finalData;
      } else {
        Logger.log(`${t("exec_fail")}: ${response.error}`, "error");
        outputContent = `❌ Error: ${response.error}`;
      }
      saveToBuffer(payload.request_id, outputContent);

      // [Fix 5] Manual check required: Tool completion doesn't trigger MutationObserver.
      setTimeout(runMainLoop, 50);
    }
  );
}

function finishVirtualTool(payload: any) {
  const msg = payload.arguments?.message ?? "Task Completed";
  Logger.log(`🔔 Notification: ${msg}`, "action");
  chrome.runtime.sendMessage({
    type: "SHOW_NOTIFICATION",
    title: `${BRANDING.productName} Task Finished`,
    message: msg,
  });
  activeExecutions.delete(payload.request_id);
  resultBuffer.set(payload.request_id, "");
}

function saveToBuffer(requestId: string, content: string, isError = false) {
  const responseJson: any = {
    mcp_action: "result",
    request_id: requestId,
    status: isError ? "error" : "success",
  };
  if (isError) {
    responseJson.error = content;
  } else {
    responseJson.output = content;
  }

  toolCallCount++;
  if (toolCallCount > 0 && toolCallCount % 5 === 0) {
    const note = i18n.resources.train ?? `[System] Reminder: Tool calls MUST use this JSON format: {"mcp_action":"call", "name": "tool_name", "arguments": {...}}.`;
    responseJson.system_note = note;
  }

  const jsonString = `\`\`\`json\n${JSON.stringify(
    responseJson,
    null,
    2
  )}\n\`\`\``;
  resultBuffer.set(requestId, jsonString);
}

// === 审批队列处理 ===
function processConfirmationQueue() {
  if (isPopupOpen || confirmationQueue.length === 0) { return; }

  while (confirmationQueue.length > 0 && isPayloadApproved(confirmationQueue[0])) {
    const approvedPayload = confirmationQueue.shift();
    if (!approvedPayload) { return; }
    Logger.log(`Approval already saved for '${getApprovalLabel(approvedPayload)}'; skipping confirmation`, "action");
    performExecution(approvedPayload);
  }

  if (confirmationQueue.length === 0) { return; }

  const payload = confirmationQueue[0] as any;
  isPopupOpen = true;
  chrome.runtime.sendMessage({
    type: "SHOW_NOTIFICATION",
    title: "Approval Required",
    message: `Tool: ${payload.name}`,
  });

  UI.showConfirmationModal(
    payload,
    (scope) => {
      confirmationQueue.shift();
      isPopupOpen = false;
      if (DOM) {
        const inputEl = document.querySelector(DOM.inputArea) as HTMLElement;
        if (inputEl) { inputEl.focus(); }
      }

      if (scope) {
        persistApprovalRule(payload, scope);
        const key = `allowed_tools_${currentWorkspaceId}`;
        chrome.storage.local.set({
          [key]: buildStoredApprovalEntries(),
        });
        Logger.log(`⚡ Approval saved for '${getApprovalLabel(payload, scope)}' in this workspace`, "action");
      }

      performExecution(payload);
      processConfirmationQueue();
    },
    (reason) => {
      confirmationQueue.shift();
      isPopupOpen = false;
      activeExecutions.delete(payload.request_id);
      if (DOM) {
        const inputEl = document.querySelector(DOM.inputArea) as HTMLElement;
        if (inputEl) { inputEl.focus(); }
      }
      Logger.log(`${t("hitl_rejected")}: ${payload.name}`, "error");
      saveToBuffer(
        payload.request_id,
        `User rejected execution. Reason: ${reason ?? "No reason provided."}`,
        true
      );
      processConfirmationQueue();
    }
  );
}

function isPayloadApproved(payload: ToolExecutionPayload): boolean {
  if (!COMMAND_APPROVAL_TOOLS.has(payload.name)) {
    return allowedTools.has(payload.name);
  }

  return getCommandApprovalRules(payload).some((rule) => allowedCommandRules.has(rule));
}

function persistApprovalRule(payload: ToolExecutionPayload, scope: Exclude<CommandApprovalScope, false>) {
  if (!COMMAND_APPROVAL_TOOLS.has(payload.name)) {
    allowedTools.add(payload.name);
    return;
  }

  const commandRule = getCommandApprovalRule(payload, scope);
  if (commandRule) {
    allowedCommandRules.add(commandRule);
  }
}

function buildStoredApprovalEntries(): string[] {
  return [
    ...Array.from(allowedTools).sort().map((toolName) => `tool:${toolName}`),
    ...Array.from(allowedCommandRules).sort(),
  ];
}

function getCommandApprovalRules(payload: ToolExecutionPayload): string[] {
  const exact = getCommandApprovalRule(payload, 'exact');
  const executable = getCommandApprovalRule(payload, 'executable');
  const prefix = getCommandApprovalRule(payload, 'prefix');
  return [exact, executable, prefix].filter((value): value is string => Boolean(value));
}

function getCommandApprovalRule(payload: ToolExecutionPayload, scope: Exclude<CommandApprovalScope, false>): string | null {
  const command = normalizeCommandValue(payload.arguments?.command);
  if (!command) {return null;}

  if (scope === 'exact') {
    return `command-exact:${payload.name}:${command}`;
  }

  const executable = getNormalizedCommandExecutable(command);
  if (!executable) {return null;}

  if (scope === 'executable') {
    return `command-executable:${payload.name}:${executable}`;
  }

  const prefix = getNormalizedCommandPrefix(command);
  return prefix ? `command-prefix:${payload.name}:${prefix}` : null;
}

function getApprovalLabel(payload: ToolExecutionPayload, scope: Exclude<CommandApprovalScope, false> = 'exact'): string {
  const command = normalizeCommandValue(payload.arguments?.command);
  if (COMMAND_APPROVAL_TOOLS.has(payload.name) && command) {
    const rule = getCommandApprovalRule(payload, scope);
    return rule ? `${payload.name} -> ${rule}` : `${payload.name} -> ${command}`;
  }
  return payload.name;
}

function normalizeCommandValue(command: unknown): string | null {
  if (typeof command !== "string") {return null;}
  const normalized = command.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function getNormalizedCommandExecutable(command: string): string | null {
  const tokens = tokenizeCommandLine(command);
  return tokens[0] || null;
}

function getNormalizedCommandPrefix(command: string): string | null {
  const tokens = tokenizeCommandLine(command);
  if (tokens.length === 0) {return null;}
  if (tokens.length === 1) {return tokens[0];}
  return `${tokens[0]} ${tokens[1]}`;
}

function tokenizeCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function upgradeLegacyCommandRule(entry: string): string {
  if (!entry.startsWith("command:")) {
    return entry;
  }

  return entry.replace(/^command:/, "command-exact:");
}
