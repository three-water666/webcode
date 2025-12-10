(function () {
  "use strict";

  // 引用模块
  const Logger = WebMCP.Logger;
  const UI = WebMCP.UI;
  const t = WebMCP.t;

  // === 配置与状态 ===
  let CONFIG = {
    pollInterval: 1000,
    autoSend: true,
    autoPromptEnabled: false,
  };

  let protectedTools = new Set();
  const confirmationQueue = [];
  let isPopupOpen = false;

  // === 加载资源 (Prompt/Hints) ===
  const lang = WebMCP.i18n.lang;
  const promptKey = lang === "zh" ? "prompt_zh" : "prompt_en";
  const trainKey = lang === "zh" ? "train_zh" : "train_en";
  const errorKey = lang === "zh" ? "error_zh" : "error_en";

  chrome.storage.local.get([promptKey, trainKey, errorKey], (items) => {
    WebMCP.i18n.resources.prompt = items[promptKey];
    WebMCP.i18n.resources.train = items[trainKey];
    WebMCP.i18n.resources.error = items[errorKey];
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
  let DOM = null;
  const currentPlatform = location.host.includes("deepseek")
    ? "deepseek"
    : location.host.includes("gemini")
    ? "gemini"
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
      if (items.protected_tools)
        protectedTools = new Set(items.protected_tools);
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
  const processedRequests = new Set();
  const flushedRequests = new Set();
  const blockStates = new WeakMap();
  const resultBuffer = new Map();
  const activeExecutions = new Set();
  const STABILIZATION_TIMEOUT = 3000;
  let toolCallCount = 0;
  let lastProgressLogTime = 0;
  let lastProgressStatus = "";

  setInterval(() => {
    if (!DOM) return;
    const messages = document.querySelectorAll(DOM.messageBlocks);
    if (messages.length === 0) {
      // Auto Prompt
      const inputEl = document.querySelector(DOM.inputArea);
      if (
        inputEl &&
        CONFIG.autoPromptEnabled &&
        inputEl.textContent.trim() === ""
      ) {
        if (WebMCP.i18n.resources.prompt) {
          inputEl.innerText = WebMCP.i18n.resources.prompt;
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          Logger.log(t("auto_filled"), "action");
        }
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const codeElements = lastMessage.querySelectorAll(DOM.codeBlocks);
    const currentTurnIds = [];

    codeElements.forEach((codeEl) => {
      const textContent = codeEl.textContent.trim();
      if (!textContent.includes('"mcp_action": "call"')) return;

      try {
        const payload = JSON.parse(textContent);
        if (blockStates.has(codeEl)) blockStates.delete(codeEl);
        if (codeEl.style.borderColor === "rgb(244, 67, 54)")
          codeEl.style.border = "none";

        if (payload.mcp_action === "call" && payload.request_id) {
          currentTurnIds.push(payload.request_id);
          if (!processedRequests.has(payload.request_id)) {
            processedRequests.add(payload.request_id);
            activeExecutions.add(payload.request_id);
            UI.markVisualSuccess(codeEl);
            Logger.log(`${t("captured")}: ${payload.name}`, "info");
            executeTool(payload);
          } else {
            if (codeEl.dataset.mcpVisual !== "true")
              UI.markVisualSuccess(codeEl);
          }
        }
      } catch (e) {
        // JSON Stabilization
        const now = Date.now();
        let state = blockStates.get(codeEl);
        if (!state || state.text !== textContent) {
          blockStates.set(codeEl, {
            text: textContent,
            time: now,
            errorNotified: false,
          });
          if (codeEl.style.borderColor === "rgb(244, 67, 54)")
            codeEl.style.border = "none";
        } else {
          if (
            now - state.time > STABILIZATION_TIMEOUT &&
            !state.errorNotified
          ) {
            Logger.log("JSON Parse Error (Stable): " + e.message, "error");
            codeEl.style.border = "2px solid #F44336";
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
    const actionableIds = currentTurnIds.filter(
      (id) => !flushedRequests.has(id)
    );
    if (actionableIds.length > 0) {
      const completedCount = actionableIds.filter(
        (id) => !activeExecutions.has(id) && resultBuffer.has(id)
      ).length;
      const totalCount = actionableIds.length;

      if (completedCount === totalCount) {
        const orderedResults = [];
        let hasUnflushedContent = false;
        actionableIds.forEach((id) => {
          const res = resultBuffer.get(id);
          if (res) {
            orderedResults.push(res);
            hasUnflushedContent = true;
          }
        });

        if (hasUnflushedContent) {
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
          const anyVirtual = actionableIds.some((id) => resultBuffer.has(id));
          if (anyVirtual)
            actionableIds.forEach((id) => {
              resultBuffer.delete(id);
              flushedRequests.add(id);
            });
        }
        lastProgressStatus = "";
      } else {
        const statusStr = `${completedCount}/${totalCount}`;
        const now = Date.now();
        if (
          statusStr !== lastProgressStatus ||
          now - lastProgressLogTime > 3000
        ) {
          Logger.log(`${t("waiting_tools")} (${statusStr} completed)`, "warn");
          lastProgressStatus = statusStr;
          lastProgressLogTime = now;
        }
      }
    }
  }, CONFIG.pollInterval);

  // === 执行工具 ===
  function executeTool(payload) {
    if (payload.name === "task_completion_notification") {
      finishVirtualTool(payload);
      return;
    }

    if (protectedTools.has(payload.name)) {
      Logger.log(`${t("hitl_intercept")}: ${payload.name}`, "warn");
      confirmationQueue.push(payload);
      processConfirmationQueue();
      return;
    }

    performExecution(payload);
  }

  function performExecution(payload) {
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
              const toolNames = realTools.map((t) => t.name);
              chrome.storage.local.set({ cached_tool_list: toolNames });
            } catch (e) {}
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

  function finishVirtualTool(payload) {
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

  function saveToBuffer(requestId, content, isError = false) {
    const responseJson = {
      mcp_action: "result",
      request_id: requestId,
      status: isError ? "error" : "success",
    };
    if (isError) responseJson.error = content;
    else responseJson.output = content;

    toolCallCount++;
    if (toolCallCount > 0 && toolCallCount % 5 === 0) {
      if (WebMCP.i18n.resources.train)
        responseJson.system_note = WebMCP.i18n.resources.train;
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
    const payload = confirmationQueue[0];
    isPopupOpen = true;
    chrome.runtime.sendMessage({
      type: "SHOW_NOTIFICATION",
      title: "Approval Required",
      message: `Tool: ${payload.name}`,
    });

    UI.showConfirmationModal(
      payload,
      () => {
        confirmationQueue.shift();
        isPopupOpen = false;
        const inputEl = document.querySelector(DOM.inputArea);
        if (inputEl) inputEl.focus();
        performExecution(payload);
        processConfirmationQueue();
      },
      (reason) => {
        confirmationQueue.shift();
        isPopupOpen = false;
        activeExecutions.delete(payload.request_id);
        const inputEl = document.querySelector(DOM.inputArea);
        if (inputEl) inputEl.focus();
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
})();
