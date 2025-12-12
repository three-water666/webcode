import { Logger, i18n, t } from "../modules/utils";
import * as UI from "../modules/ui";
import { DEFAULT_SELECTORS, SiteSelectors } from "../modules/config";
import { ToolExecutionPayload } from "../types";

// === 配置与状态 ===
interface ConfigState {
  pollInterval: number;
  autoSend: boolean;
  autoPromptEnabled: boolean;
}

let CONFIG: ConfigState = {
  pollInterval: 1000,
  autoSend: true,
  autoPromptEnabled: false,
};

let protectedTools = new Set<string>();
const confirmationQueue: ToolExecutionPayload[] = [];
let isPopupOpen = false;

// === 加载资源 (Prompt/Hints) ===
const lang = i18n.lang;
const promptKey = lang === "zh" ? "prompt_zh" : "prompt_en";
const trainKey = lang === "zh" ? "train_zh" : "train_en";
const errorKey = lang === "zh" ? "error_zh" : "error_en";

chrome.storage.local.get([promptKey, trainKey, errorKey], (items) => {
  i18n.resources.prompt = items[promptKey];
  i18n.resources.train = items[trainKey];
  i18n.resources.error = items[errorKey];
  console.log(`[MCP] Loaded i18n resources (${lang})`);
});

// 监听日志开关消息
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "TOGGLE_LOG") {
    Logger.toggle(request.show);
    Logger.log("Logger Visible: " + request.show, "info");
  }
});

// === DOM 选择器与配置 ===
let activeSelectors = DEFAULT_SELECTORS;
let DOM: SiteSelectors | null = null;
const currentPlatform = location.host.includes("deepseek")
  ? "deepseek"
  : location.host.includes("gemini")
  ? "gemini"
  : location.host.includes("aistudio")
  ? "aistudio"
  : "chatgpt";

function updateDOMConfig() {
  if (activeSelectors && activeSelectors[currentPlatform])
    DOM = activeSelectors[currentPlatform];
}

chrome.storage.sync.get(
  ["autoSend", "autoPromptEnabled", "customSelectors", "protected_tools"],
  (items) => {
    CONFIG.autoSend = items.autoSend ?? true;
    CONFIG.autoPromptEnabled = items.autoPromptEnabled ?? false;
    if (items.customSelectors) activeSelectors = items.customSelectors;
    if (items.protected_tools) protectedTools = new Set(items.protected_tools);
    updateDOMConfig();
  }
);

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync") {
    if (changes.autoSend) CONFIG.autoSend = changes.autoSend.newValue;
    if (changes.autoPromptEnabled)
      CONFIG.autoPromptEnabled = changes.autoPromptEnabled.newValue;
    if (changes.customSelectors) {
      activeSelectors = changes.customSelectors.newValue;
      updateDOMConfig();
      Logger.log(t("config_updated"), "action");
    }
    if (changes.protected_tools) {
      protectedTools = new Set(changes.protected_tools.newValue);
      Logger.log("Protected tools updated", "action");
    }
  }
});

// === 主循环逻辑 ===
const processedRequests = new Set<string>();
const flushedRequests = new Set<string>();
const blockStates = new WeakMap<
  Element,
  { text: string; time: number; errorNotified: boolean }
>();
const resultBuffer = new Map<string, string>();
const activeExecutions = new Set<string>();
const STABILIZATION_TIMEOUT = 3000;
let toolCallCount = 0;
let lastProgressLogTime = 0;
let lastProgressStatus = "";

setInterval(() => {
  if (!DOM) return;
  const messages = document.querySelectorAll(DOM.messageBlocks);
  if (messages.length === 0) {
    // Auto Prompt
    const inputEl = document.querySelector(DOM.inputArea) as HTMLElement;
    if (
      inputEl &&
      CONFIG.autoPromptEnabled &&
      (inputEl.textContent || "").trim() === ""
    ) {
      if (i18n.resources.prompt) {
        inputEl.innerText = i18n.resources.prompt;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        Logger.log(t("auto_filled"), "action");
      }
    }
    return;
  }

  const lastMessage = messages[messages.length - 1];
  const codeElements = lastMessage.querySelectorAll(DOM.codeBlocks);
  const currentTurnIds: string[] = [];

  codeElements.forEach((codeEl) => {
    const textContent = (codeEl.textContent || "").trim();
    if (!textContent.includes('"mcp_action": "call"')) return;

    try {
      const payload = JSON.parse(textContent);
      if (blockStates.has(codeEl)) blockStates.delete(codeEl);

      // 成功解析 JSON，尝试清除旧的错误样式（如果存在）
      if ((codeEl as HTMLElement).dataset.mcpState === "error") {
        (codeEl as HTMLElement).style.border = "none";
        delete (codeEl as HTMLElement).dataset.mcpState;
      }

      if (payload.mcp_action === "call" && payload.request_id) {
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
      let state = blockStates.get(codeEl);
      if (!state || state.text !== textContent) {
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
            title: "WebMCP Error",
            message: "Invalid JSON format (Stuck).",
          });
          state.errorNotified = true;
          blockStates.set(codeEl, state);
        }
      }
    }
  });

  // 批处理队列
  const actionableIds = currentTurnIds.filter((id) => !flushedRequests.has(id));
  if (actionableIds.length > 0) {
    const completedCount = actionableIds.filter(
      (id) => !activeExecutions.has(id) && resultBuffer.has(id)
    ).length;
    const totalCount = actionableIds.length;

    // [Fix 3] 只要所有已知工具完成（且通过下方的 Stop 按钮检查），即可尝试发送
    if (completedCount === totalCount) {
      // [Fix 4] Double Check: 页面上是否有 Stop 按钮？
      const stopBtn = DOM.stopButton
        ? document.querySelector(DOM.stopButton)
        : null;
      if (stopBtn) {
        // AI 还在忙，推迟发送
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
        Logger.log(
          `Batch finished: ${orderedResults.length} tools. Writing...`,
          "success"
        );
        UI.writeToInputBox(orderedResults.join("\n\n"), DOM.inputArea);
        actionableIds.forEach((id) => {
          resultBuffer.delete(id);
          flushedRequests.add(id);
        });
        UI.triggerAutoSend(CONFIG, DOM);
      } else {
        // 纯虚拟工具（无输出）
        const anyVirtual = actionableIds.some((id) => resultBuffer.has(id));
        if (anyVirtual)
          actionableIds.forEach((id) => {
            resultBuffer.delete(id);
            flushedRequests.add(id);
          });
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
}, CONFIG.pollInterval);

// === 执行工具 ===
function executeTool(payload: ToolExecutionPayload) {
  // 虚拟工具：任务完成通知
  if (payload.name === "task_completion_notification") {
    finishVirtualTool(payload);
    return;
  }

  if (protectedTools.has(payload.name)) {
    Logger.log(`${t("hitl_intercept")}: ${payload.name}`, "warn");
    (payload as any).request_id = (payload as any).request_id || "unknown_id";
    confirmationQueue.push(payload);
    processConfirmationQueue();
    return;
  }

  performExecution(payload);
}

function performExecution(payload: any) {
  chrome.runtime.sendMessage(
    { type: "EXECUTE_TOOL", payload: payload },
    (response) => {
      activeExecutions.delete(payload.request_id);
      let outputContent = "";
      if (response && response.success) {
        Logger.log(`${t("exec_success")}: ${payload.name}`, "success");
        let finalData = response.data;
        if (payload.name === "list_tools") {
          try {
            const realTools = JSON.parse(finalData);
            const toolNames = realTools.map((t: any) => t.name);

            // [HITL] Security: Auto-protect new tools
            chrome.storage.local.get(["cached_tool_list"], (localData) => {
              const knownTools = new Set(localData.cached_tool_list || []);
              let protectedDirty = false;
              toolNames.forEach((tName: string) => {
                if (!knownTools.has(tName)) {
                  if (!protectedTools.has(tName)) {
                    protectedTools.add(tName);
                    protectedDirty = true;
                  }
                }
              });
              if (protectedDirty) {
                chrome.storage.sync.set({
                  protected_tools: Array.from(protectedTools),
                });
                Logger.log("🛡️ New tools detected & protected", "warn");
              }
              chrome.storage.local.set({ cached_tool_list: toolNames });
            });
          } catch (e) {
            console.error("Auto-protect logic error", e);
          }
          try {
            const tools = JSON.parse(finalData);
            tools.push({
              name: "task_completion_notification",
              description:
                "Notify the user that a long-running task or a series of complex operations is complete. Use this when you need the user's attention to review your work or provide new instructions. Calling this will trigger a system notification on the user's device.",
              inputSchema: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"],
              },
            });
            finalData = JSON.stringify(tools, null, 2);
          } catch (e) {}
        }
        outputContent = finalData;
      } else {
        Logger.log(`${t("exec_fail")}: ${response.error}`, "error");
        outputContent = `❌ Error: ${response.error}`;
      }
      saveToBuffer(payload.request_id, outputContent);
    }
  );
}

function finishVirtualTool(payload: any) {
  const msg = payload.arguments?.message || "Task Completed";
  Logger.log(`🔔 Notification: ${msg}`, "action");
  chrome.runtime.sendMessage({
    type: "SHOW_NOTIFICATION",
    title: "WebMCP Task Finished",
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
    if (i18n.resources.train) responseJson.system_note = i18n.resources.train;
    else
      responseJson.system_note = `[System] Reminder: Tool calls MUST use this JSON format: {"mcp_action":"call", "name": "tool_name", "arguments": {...}}.`;
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
  if (isPopupOpen || confirmationQueue.length === 0) return;
  const payload = confirmationQueue[0] as any;
  isPopupOpen = true;
  chrome.runtime.sendMessage({
    type: "SHOW_NOTIFICATION",
    title: "Approval Required",
    message: `Tool: ${payload.name}`,
  });

  UI.showConfirmationModal(
    payload,
    (isAlways) => {
      confirmationQueue.shift();
      isPopupOpen = false;
      if (DOM) {
        const inputEl = document.querySelector(DOM.inputArea) as HTMLElement;
        if (inputEl) inputEl.focus();
      }

      if (isAlways) {
        protectedTools.delete(payload.name);
        chrome.storage.sync.set({
          protected_tools: Array.from(protectedTools),
        }, () => {
          // [Host Sync] Notify background to push new config to Gateway
          chrome.runtime.sendMessage({ type: "SYNC_CONFIG" });
        });
        Logger.log(`⚡ Tool '${payload.name}' set to Always Allow`, "action");
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
        if (inputEl) inputEl.focus();
      }
      Logger.log(`${t("hitl_rejected")}: ${payload.name}`, "error");
      saveToBuffer(
        payload.request_id,
        `User rejected execution. Reason: ${reason || "No reason provided."}`,
        true
      );
      processConfirmationQueue();
    }
  );
}
