(function () {
  "use strict";

  // === 配置与状态 ===
  let CONFIG = {
    pollInterval: 1000,
    autoSend: true,
    autoPromptEnabled: false,
  };

  // HITL: 受保护的工具集合
  let protectedTools = new Set();
  // HITL: 待审批队列
  const confirmationQueue = [];
  let isPopupOpen = false;
  
  // === 国际化资源缓存 ===
  const i18n = {
    lang: navigator.language.startsWith('zh') ? 'zh' : 'en',
    prompt: null,
    train: null,
    error: null
  };

  // === 日志系统 ===
  const LOG_MSGS = {
    auto_filled: { en: "Auto-filled initial Prompt", zh: "已自动填充初始 Prompt" },
    captured: { en: "Captured Call", zh: "捕获调用" },
    args: { en: "Args", zh: "参数" },
    exec_success: { en: "Execution Success", zh: "执行成功" },
    exec_fail: { en: "Execution Failed", zh: "执行失败" },
    training_hint: { en: "Added periodic training note", zh: "已附加定期复训提示" },
    input_not_found: { en: "Input box not found!", zh: "找不到输入框!" },
    result_written: { en: "Result written back to input", zh: "结果已回填至输入框" },
    send_success_cleared: { en: "Send success (Input cleared)", zh: "发送成功 (输入框已清空)" },
    send_btn_missing: { en: "Send button not found...", zh: "未找到发送按钮..." },
    send_btn_disabled: { en: "Send button disabled (UI not updated)...", zh: "发送按钮仍被禁用 (UI未更新)..." },
    auto_send_attempt: { en: "Attempting auto-send", zh: "尝试自动发送" },
    auto_send_timeout: { en: "Auto-send timed out, please click manually", zh: "自动发送超时，请手动点击发送" },
    config_updated: { en: "Selectors config updated", zh: "选择器配置已更新" },
    waiting_tools: { en: "Waiting for tools...", zh: "等待工具执行..." },
    hitl_intercept: { en: "Intercepted for approval", zh: "拦截等待审批" },
    hitl_rejected: { en: "User rejected execution", zh: "用户拒绝执行" }
  };

  function t(key) {
    const entry = LOG_MSGS[key];
    if (!entry) return key;
    return entry[i18n.lang] || entry.en;
  }

  const promptKey = i18n.lang === 'zh' ? 'prompt_zh' : 'prompt_en';
  const trainKey = i18n.lang === 'zh' ? 'train_zh' : 'train_en';
  const errorKey = i18n.lang === 'zh' ? 'error_zh' : 'error_en';
  
  chrome.storage.local.get([promptKey, trainKey, errorKey], (items) => {
      i18n.prompt = items[promptKey];
      i18n.train = items[trainKey];
      i18n.error = items[errorKey];
      console.log(`[MCP] Loaded i18n resources (${i18n.lang})`);
  });

  // === Logger ===
  const Logger = {
    el: null, contentEl: null,
    init() {
      if (this.el) return;
      this.el = document.createElement("div");
      Object.assign(this.el.style, { position: "fixed", top: "20px", right: "20px", width: "320px", height: "200px", backgroundColor: "rgba(0,0,0,0.85)", color: "#00ff00", fontFamily: "Consolas, monospace", fontSize: "12px", zIndex: "99999", borderRadius: "8px", display: "none", flexDirection: "column", border: "1px solid #333" });
      const header = document.createElement("div");
      header.innerText = "WebMCP Bridge Process Log";
      Object.assign(header.style, { padding: "6px", backgroundColor: "#333", color: "#fff", cursor: "move", display: "flex", justifyContent: "space-between" });
      const clearBtn = document.createElement("span");
      clearBtn.innerText = "🗑️"; clearBtn.style.cursor = "pointer";
      clearBtn.onclick = () => (this.contentEl.innerHTML = "");
      header.appendChild(clearBtn);
      this.contentEl = document.createElement("div");
      Object.assign(this.contentEl.style, { flex: "1", overflowY: "auto", padding: "8px" });
      this.el.appendChild(header); this.el.appendChild(this.contentEl); document.body.appendChild(this.el);
      this.makeDraggable(header);
    },
    makeDraggable(headerEl) {
      let isDragging = false, startX, startY, iLeft, iTop;
      headerEl.onmousedown = (e) => { isDragging = true; startX = e.clientX; startY = e.clientY; const r = this.el.getBoundingClientRect(); iLeft = r.left; iTop = r.top; };
      window.onmousemove = (e) => { if (isDragging) { this.el.style.left = (iLeft + e.clientX - startX) + "px"; this.el.style.top = (iTop + e.clientY - startY) + "px"; this.el.style.right = "auto"; }};
      window.onmouseup = () => isDragging = false;
    },
    toggle(show) { if (!this.el && show) this.init(); if (this.el) this.el.style.display = show ? "flex" : "none"; },
    log(msg, type = "info") {
      if (!this.el || this.el.style.display === "none") return;
      const line = document.createElement("div");
      const time = new Date().toLocaleTimeString("en-US", { hour12: false });
      let icon = "🔹", color = "#ddd";
      if (type === "success") { icon = "✅"; color = "#4caf50"; } else if (type === "error") { icon = "❌"; color = "#f44336"; } else if (type === "warn") { icon = "⚠️"; color = "#ff9800"; } else if (type === "action") { icon = "⚡"; color = "#00bcd4"; }
      line.innerHTML = `<span style="color:#888; font-size:10px">[${time}]</span> ${icon} <span style="color:${color}">${msg}</span>`;
      this.contentEl.appendChild(line); this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  };

  chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'TOGGLE_LOG') { Logger.toggle(request.show); Logger.log("Logger Visible: " + request.show, "info"); }
  });

  // === DOM 选择器与配置 ===
  let activeSelectors = DEFAULT_SELECTORS;
  let DOM = null;
  const currentPlatform = location.host.includes("deepseek") ? "deepseek" : location.host.includes("gemini") ? "gemini" : "chatgpt";
  
  function updateDOMConfig() { 
    if (activeSelectors && activeSelectors[currentPlatform]) DOM = activeSelectors[currentPlatform]; 
  }

  chrome.storage.sync.get(["autoSend", "autoPromptEnabled", "customSelectors", "protected_tools"], (items) => {
      CONFIG.autoSend = items.autoSend ?? true;
      CONFIG.autoPromptEnabled = items.autoPromptEnabled ?? false;
      if (items.customSelectors) activeSelectors = items.customSelectors;
      if (items.protected_tools) protectedTools = new Set(items.protected_tools);
      updateDOMConfig();
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync") {
      if (changes.autoSend) CONFIG.autoSend = changes.autoSend.newValue;
      if (changes.autoPromptEnabled) CONFIG.autoPromptEnabled = changes.autoPromptEnabled.newValue;
      if (changes.customSelectors) { activeSelectors = changes.customSelectors.newValue; updateDOMConfig(); Logger.log(t("config_updated"), "action"); }
      if (changes.protected_tools) { protectedTools = new Set(changes.protected_tools.newValue); Logger.log("Protected tools updated", "action"); }
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
  let autoSendTimer = null;
  let lastProgressLogTime = 0;
  let lastProgressStatus = "";

  setInterval(() => {
    if (!DOM) return;
    const messages = document.querySelectorAll(DOM.messageBlocks);
    if (messages.length === 0) {
      // Auto Prompt Logic
      const inputEl = document.querySelector(DOM.inputArea);
      if (inputEl && CONFIG.autoPromptEnabled && inputEl.textContent.trim() === "") {
          if (i18n.prompt) { inputEl.innerText = i18n.prompt; inputEl.dispatchEvent(new Event("input", { bubbles: true })); Logger.log(t("auto_filled"), "action"); }
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
        if (codeEl.style.borderColor === "rgb(244, 67, 54)") codeEl.style.border = "none";

        if (payload.mcp_action === "call" && payload.request_id) {
          currentTurnIds.push(payload.request_id);
          if (!processedRequests.has(payload.request_id)) {
            processedRequests.add(payload.request_id);
            activeExecutions.add(payload.request_id);
            markVisualSuccess(codeEl);
            Logger.log(`${t("captured")}: ${payload.name}`, "info");
            executeTool(payload);
          } else {
             if (codeEl.dataset.mcpVisual !== "true") markVisualSuccess(codeEl);
          }
        }
      } catch (e) {
        const now = Date.now();
        let state = blockStates.get(codeEl);
        if (!state || state.text !== textContent) {
            blockStates.set(codeEl, { text: textContent, time: now, errorNotified: false });
            if (codeEl.style.borderColor === "rgb(244, 67, 54)") codeEl.style.border = "none";
        } else {
            if (now - state.time > STABILIZATION_TIMEOUT && !state.errorNotified) {
                Logger.log("JSON Parse Error (Stable): " + e.message, "error");
                codeEl.style.border = "2px solid #F44336";
                chrome.runtime.sendMessage({ type: "SHOW_NOTIFICATION", title: "WebMCP Error", message: "Invalid JSON format (Stuck)." });
                state.errorNotified = true;
                blockStates.set(codeEl, state);
            }
        }
      }
    });

    // 批处理队列检查
    const actionableIds = currentTurnIds.filter(id => !flushedRequests.has(id));
    if (actionableIds.length > 0) {
        const completedCount = actionableIds.filter(id => !activeExecutions.has(id) && resultBuffer.has(id)).length;
        const totalCount = actionableIds.length;
        
        if (completedCount === totalCount) {
             const orderedResults = [];
             let hasUnflushedContent = false;
             actionableIds.forEach(id => { const res = resultBuffer.get(id); if (res) { orderedResults.push(res); hasUnflushedContent = true; }});
             if (hasUnflushedContent) {
                 Logger.log(`Batch finished: ${orderedResults.length} tools. Writing...`, "success");
                 writeToInputBox(orderedResults.join("\n\n"));
                 actionableIds.forEach(id => { resultBuffer.delete(id); flushedRequests.add(id); });
                 triggerAutoSend();
             } else {
                 const anyVirtual = actionableIds.some(id => resultBuffer.has(id));
                 if (anyVirtual) actionableIds.forEach(id => { resultBuffer.delete(id); flushedRequests.add(id); });
             }
             lastProgressStatus = "";
        } else {
            const statusStr = `${completedCount}/${totalCount}`;
            const now = Date.now();
            if (statusStr !== lastProgressStatus || now - lastProgressLogTime > 3000) {
                Logger.log(`${t("waiting_tools")} (${statusStr} completed)`, "warn");
                lastProgressStatus = statusStr; lastProgressLogTime = now;
            }
        }
    }
  }, CONFIG.pollInterval);

  // === 核心：执行工具 ===
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
      chrome.runtime.sendMessage({ type: "EXECUTE_TOOL", payload: payload }, (response) => {
          activeExecutions.delete(payload.request_id);
          let outputContent = "";
          if (response && response.success) {
              Logger.log(`${t("exec_success")}: ${payload.name}`, "success");
              let finalData = response.data;
              if (payload.name === "list_tools") {
                  try {
                      const realTools = JSON.parse(finalData);
                      const toolNames = realTools.map(t => t.name);
                      chrome.storage.local.set({ 'cached_tool_list': toolNames });
                  } catch(e) {}
                  try {
                      const tools = JSON.parse(finalData);
                      tools.push({
                          name: "task_completion_notification",
                          description: "Notify the user that a long-running task is complete.",
                          inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] }
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
      });
  }

  function finishVirtualTool(payload) {
      const msg = payload.arguments?.message || "Task Completed";
      Logger.log(`🔔 Notification: ${msg}`, "action");
      chrome.runtime.sendMessage({ type: "SHOW_NOTIFICATION", title: "WebMCP Task Finished", message: msg });
      activeExecutions.delete(payload.request_id);
      resultBuffer.set(payload.request_id, "");
  }

  function saveToBuffer(requestId, content, isError = false) {
      const responseJson = {
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
         if (i18n.train) responseJson.system_note = i18n.train;
         else responseJson.system_note = `[System] Reminder: Tool calls MUST use this JSON format: {"mcp_action":"call", "name": "tool_name", "arguments": {...}}.`;
      }

      const jsonString = `\`\`\`json\n${JSON.stringify(responseJson, null, 2)}\n\`\`\``;
      resultBuffer.set(requestId, jsonString);
  }

  // === HITL UI Logic (Shadow DOM) ===
  function processConfirmationQueue() {
      if (isPopupOpen || confirmationQueue.length === 0) return;
      
      const payload = confirmationQueue[0];
      isPopupOpen = true;
      chrome.runtime.sendMessage({ type: "SHOW_NOTIFICATION", title: "Approval Required", message: `Tool: ${payload.name}` });

      showConfirmationModal(payload, 
          () => {
              confirmationQueue.shift();
              isPopupOpen = false;
              
              // [Robust Fix] Force focus back to ensure auto-send works
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
              saveToBuffer(payload.request_id, `User rejected execution. Reason: ${reason || "No reason provided."}`, true);
              processConfirmationQueue();
          }
      );
  }

  function showConfirmationModal(payload, onConfirm, onReject) {
      const host = document.createElement('div');
      Object.assign(host.style, { position: 'fixed', zIndex: 999999, top: 0, left: 0, width: '0', height: '0' });
      document.body.appendChild(host);
      const shadow = host.attachShadow({mode: 'open'});
      
      const style = document.createElement('style');
      style.textContent = `
        .overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .card { background: #fff; padding: 24px; border-radius: 12px; width: 450px; max-width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.4); border: 1px solid #e0e0e0; color: #333; animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        h2 { margin: 0 0 16px 0; color: #d32f2f; display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 600; }
        .warn-icon { font-size: 24px; }
        .field { margin-bottom: 16px; }
        .label { font-weight: 600; font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block; }
        .value { background: #f8f9fa; padding: 10px; border-radius: 6px; font-family: "Menlo", "Consolas", monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all; max-height: 250px; overflow-y: auto; border: 1px solid #e9ecef; color: #212529; }
        .buttons { display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end; align-items: center; }
        button { padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s; }
        button:hover { transform: translateY(-1px); box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .btn-reject { background: #fff; color: #dc3545; border: 1px solid #dc3545; }
        .btn-reject:hover { background: #dc3545; color: white; }
        .btn-confirm { background: #2e7d32; color: white; box-shadow: 0 2px 5px rgba(46, 125, 50, 0.3); }
        .btn-confirm:hover { background: #1b5e20; box-shadow: 0 4px 8px rgba(46, 125, 50, 0.4); }
        .btn-back { background: #6c757d; color: white; display: none; margin-right: auto; }
        .btn-back:hover { background: #5a6268; }
        input.reason { width: 100%; box-sizing: border-box; padding: 10px; margin-top: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; display: none; }
        input.reason:focus { outline: none; border-color: #dc3545; }
      `;
      shadow.appendChild(style);

      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      
      const card = document.createElement('div');
      card.className = 'card';
      
      card.innerHTML = `
        <h2><span class="warn-icon">✋</span> Approval Required</h2>
        <div class="field">
            <span class="label">Tool Name</span>
            <div class="value" style="font-weight:bold; color:#d32f2f">${payload.name}</div>
        </div>
        <div class="field">
            <span class="label">Arguments</span>
            <div class="value">${JSON.stringify(payload.arguments || {}, null, 2)}</div>
        </div>
        <input type="text" class="reason" placeholder="Reason for rejection (Optional)...">
        <div class="buttons">
            <button class="btn-back">Back</button>
            <button class="btn-reject">Reject</button>
            <button class="btn-confirm">Approve & Execute</button>
        </div>
      `;

      const btnBack = card.querySelector('.btn-back');
      const btnReject = card.querySelector('.btn-reject');
      const btnConfirm = card.querySelector('.btn-confirm');
      const inputReason = card.querySelector('.reason');

      btnConfirm.onclick = () => {
          document.body.removeChild(host);
          onConfirm();
      };

      let rejectStep = 0;
      btnReject.onclick = () => {
          if (rejectStep === 0) {
              rejectStep = 1;
              inputReason.style.display = 'block';
              inputReason.focus();
              btnReject.textContent = "Confirm Rejection";
              btnConfirm.style.display = 'none';
              btnBack.style.display = 'inline-block';
          } else {
              const reason = inputReason.value.trim();
              document.body.removeChild(host);
              onReject(reason);
          }
      };
      
      btnBack.onclick = () => {
          rejectStep = 0;
          inputReason.style.display = 'none';
          inputReason.value = '';
          btnReject.textContent = "Reject";
          btnConfirm.style.display = 'inline-block';
          btnBack.style.display = 'none';
      };

      inputReason.onkeydown = (e) => {
          if (e.key === 'Enter') btnReject.click();
      };

      overlay.appendChild(card);
      shadow.appendChild(overlay);
  }

  function markVisualSuccess(element) { element.dataset.mcpVisual = "true"; element.style.border = "2px solid #00E676"; element.style.borderRadius = "4px"; }
  
  function writeToInputBox(text) {
     const inputEl = document.querySelector(DOM.inputArea);
     if (!inputEl) { Logger.log(t("input_not_found"), "error"); return; }

     let cur = inputEl.innerText || inputEl.value || "";
     cur = cur.replace(/\r\n/g, "\n").replace(/\n+/g, "\n").trim();
     const sep = cur ? "\n\n" : "";
     const final = cur + sep + text;

     inputEl.focus();
     let success = false;
     try {
         document.execCommand('selectAll', false, null);
         success = document.execCommand('insertText', false, final);
     } catch (e) {}

     if (!success) {
         if(inputEl.tagName==="TEXTAREA"||inputEl.tagName==="INPUT") inputEl.value=final; else inputEl.innerText=final;
         inputEl.dispatchEvent(new Event("input", { bubbles: true }));
     }
     Logger.log(t("result_written"), "action");
  }

  // [ROBUST FIX] 恢复完整的自动发送逻辑
  function triggerAutoSend() {
      if (!CONFIG.autoSend) return;
      
      if (autoSendTimer) {
          clearTimeout(autoSendTimer);
          autoSendTimer = null;
      }

      let retryCount = 0;
      const maxRetries = 5;

      const trySend = () => {
        const btn = document.querySelector(DOM.sendButton);
        const inputEl = document.querySelector(DOM.inputArea);
        const currentVal = inputEl ? (inputEl.value || inputEl.innerText || "") : "";
        
        // [HitL Fix] 强制聚焦，确保点击有效
        if (inputEl) inputEl.focus();
        
        if (currentVal.trim().length === 0) { Logger.log(t("send_success_cleared"), "success"); return; }

        // 触发 UI 事件
        if (inputEl) {
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (btn && !btn.disabled) {
           btn.focus();
           btn.click();
           Logger.log(`${t("auto_send_attempt")} (${retryCount + 1})`, "action");
        } else if (!btn) {
           Logger.log(t("send_btn_missing"), "warn");
        } else {
           Logger.log(t("send_btn_disabled"), "warn");
        }

        retryCount++;
        if (retryCount < maxRetries) {
            autoSendTimer = setTimeout(trySend, 2000);
        } else {
            Logger.log(t("auto_send_timeout"), "error");
            chrome.runtime.sendMessage({ type: "SHOW_NOTIFICATION", title: "Auto-Send Failed", message: "Could not click send button." });
        }
      };
      autoSendTimer = setTimeout(trySend, 1000);
  }
})();