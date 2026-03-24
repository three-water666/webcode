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

// [State] Connection Guard
let isClientConnected = false;
let currentWorkspaceId = "global";

let userRules = ""; // [User Rules]
let allowedTools = new Set<string>();
const confirmationQueue: ToolExecutionPayload[] = [];
let isPopupOpen = false;

// === 加载资源 (Prompt/Hints) ===
const lang = i18n.lang;
const promptKey = lang === "zh" ? "prompt_zh" : "prompt_en";
const trainKey = lang === "zh" ? "train_zh" : "train_en";
const errorKey = lang === "zh" ? "error_hint_zh" : "error_hint_en";
const initKey = lang === "zh" ? "init_zh" : "init_en";

function loadPromptsFromStorage(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([promptKey, trainKey, errorKey, initKey], (items) => {
      if (items[promptKey]) { i18n.resources.prompt = items[promptKey]; }
      if (items[trainKey]) { i18n.resources.train = items[trainKey]; }
      if (items[errorKey]) { i18n.resources.error = items[errorKey]; }
      if (items[initKey]) { i18n.resources.init = items[initKey]; }
      resolve();
    });
  });
}

function loadWorkspaceData(workspaceId: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([`allowed_tools_${workspaceId}`], (localItems) => {
      allowedTools = new Set(localItems[`allowed_tools_${workspaceId}`] || []);
      resolve();
    });
  });
}

// Initially load user rules from sync. Prompts will be loaded from local later.
chrome.storage.sync.get(["user_rules"], (items) => {
  userRules = items.user_rules || "";
  console.log(`[MCP] Loaded User Rules`);
});

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

function initDOMConfig() {
  chrome.storage.sync.get(
    ["autoSend", "autoPromptEnabled", "user_rules"],
    (items) => {
      CONFIG.autoSend = items.autoSend ?? true;
      CONFIG.autoPromptEnabled = items.autoPromptEnabled ?? false;
      if (items.user_rules) { userRules = items.user_rules; }

      chrome.storage.local.get(["syncedAiSites"], (localItems) => {
        const sites = localItems.syncedAiSites || [];
        const currentUrl = location.href;

        // Find matching site by URL prefix
        const matchedSite = sites.find((site: any) => currentUrl.startsWith(site.address));

        if (matchedSite && matchedSite.selectors) {
          DOM = matchedSite.selectors;
          currentPlatform = matchedSite.name;
          startObserver();
        } else {
          // Fallback logic for built-in sites if gateway hasn't synced yet (or old version)
          const host = location.host;
          const legacyPlatform = host.includes("deepseek") ? "deepseek"
            : host.includes("gemini") ? "gemini"
            : host.includes("aistudio") ? "aistudio"
            : (host.includes("chatgpt") || host.includes("openai")) ? "chatgpt"
            : null;

          if (legacyPlatform) {
            // Read from defaultSelectors (from VS Code init sync) or fallback to hardcoded
            chrome.storage.local.get(["defaultSelectors"], (defItems) => {
               const defaults = defItems.defaultSelectors || DEFAULT_SELECTORS;
               DOM = defaults[legacyPlatform];
               currentPlatform = legacyPlatform;
               startObserver();
            });
          } else {
            console.log("WebMCP: Current site is not configured in VS Code. Idle.");
          }
        }
      });
    }
  );
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync") {
    if (changes.autoSend) { CONFIG.autoSend = changes.autoSend.newValue; }
    if (changes.autoPromptEnabled) { CONFIG.autoPromptEnabled = changes.autoPromptEnabled.newValue; }
    if (changes.user_rules) { userRules = changes.user_rules.newValue; }
  }
  if (namespace === "local") {
    if (changes[`allowed_tools_${currentWorkspaceId}`]) {
      allowedTools = new Set(changes[`allowed_tools_${currentWorkspaceId}`].newValue || []);
      Logger.log(`Allowed tools updated (Workspace: ${currentWorkspaceId})`, "action");
    }
    if (changes.syncedAiSites) {
      initDOMConfig();
      Logger.log(t("config_updated"), "action");
    }
    if (changes[promptKey] || changes[trainKey] || changes[errorKey] || changes[initKey]) {
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
  if (messages.length === 0) {
    // Auto Prompt
    const inputEl = document.querySelector(DOM.inputArea) as HTMLElement;
    if (
      inputEl &&
      CONFIG.autoPromptEnabled &&
      (inputEl.textContent || "").trim() === ""
    ) {
      if (i18n.resources.prompt) {
        let finalPrompt = i18n.resources.prompt;
        if (userRules) { finalPrompt += `\n\n=== User Rules ===\n${userRules}`; }
        inputEl.innerText = finalPrompt;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        Logger.log(t("auto_filled"), "action");
      }
    }
    return;
  }

  // 只处理最后一次大模型返回的消息块
  const lastMessage = messages[messages.length - 1];
  // 找到大模型最后一次返回的消息快中所有JSON块
  const codeElements = lastMessage.querySelectorAll(DOM.codeBlocks);
  // 记录大模型最后一次返回的消息块的所有JSON块中的request_id
  const currentTurnIds: string[] = [];

  codeElements.forEach((codeEl) => {
    const textContent = (codeEl.textContent || "").trim();
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
          if (!el.dataset.mcpRequestId) {
            el.dataset.mcpRequestId = "req_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
          }
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
        Logger.log(
          `Batch finished: ${orderedResults.length} tools. Writing...`,
          "success"
        );
        // 回填
        UI.writeToInputBox(orderedResults.join("\n\n"), DOM.inputArea);
        actionableIds.forEach((id) => {
          resultBuffer.delete(id);
          flushedRequests.add(id);
        });
        // 自动发送
        UI.triggerAutoSend(CONFIG, DOM);
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
  if ((window as any)._webmcp_observer_started) {return;}
  (window as any)._webmcp_observer_started = true;

  // 1. Start observing immediately (but logic inside is guarded by isClientConnected)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // 2. Check initial status
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, async (response) => {
    if (response && response.connected) {
      isClientConnected = true;
      if (response.workspaceId) {
        currentWorkspaceId = response.workspaceId;
        await loadWorkspaceData(currentWorkspaceId);
      }
      await loadPromptsFromStorage();
      Logger.log(`WebMCP activated for ${currentPlatform} (Connected)`, "info");
      runMainLoop();
    } else {
      isClientConnected = false;
      console.log(`WebMCP loaded for ${currentPlatform} (Disconnected - Idle)`);
      // Optional: Inform user that connection is missing
    }
  });
}

initDOMConfig();

// === 执行工具 ===
function executeTool(payload: ToolExecutionPayload) {
  // 虚拟工具：系统初始化
  if (payload.name === "webmcp_init") {
    let finalPrompt = i18n.resources.prompt || "";
    if (userRules) { finalPrompt += `\n\n=== User Rules ===\n${userRules}`; }

    Logger.log("Initializing WebMCP via /webmcp command", "action");

    // 将提示词包装成格式化的JSON字符串塞入 buffer，交由主循环统一等待AI停止后写入输入框
    // 不包裹为 mcp_action result，直接以纯文本的形式存入 resultBuffer
    resultBuffer.set(payload.request_id!, finalPrompt);

    activeExecutions.delete(payload.request_id!);

    setTimeout(runMainLoop, 50);

    return;
  }

  // 虚拟工具：任务完成通知
  if (payload.name === "task_completion_notification") {
    finishVirtualTool(payload);
    return;
  }

  if (!allowedTools.has(payload.name)) {
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
    let note = i18n.resources.train || `[System] Reminder: Tool calls MUST use this JSON format: {"mcp_action":"call", "name": "tool_name", "arguments": {...}}.`;
    if (userRules) { note += `\n(User Rules: ${userRules})`; }
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
        if (inputEl) { inputEl.focus(); }
      }

      if (isAlways) {
        allowedTools.add(payload.name);
        const key = `allowed_tools_${currentWorkspaceId}`;
        chrome.storage.local.set({
          [key]: Array.from(allowedTools),
        });
        Logger.log(`⚡ Tool '${payload.name}' set to Always Allow in this workspace`, "action");
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
        `User rejected execution. Reason: ${reason || "No reason provided."}`,
        true
      );
      processConfirmationQueue();
    }
  );
}
