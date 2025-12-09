(function () {
  "use strict";

  // 注意：DEFAULT_SELECTORS 现已由 config.js 提供，在此作用域中可以直接访问

  let CONFIG = {
    pollInterval: 1000,
    autoSend: true,
    autoPromptEnabled: false,
  };
  
  // === 国际化资源缓存 ===
  const i18n = {
    lang: navigator.language.startsWith('zh') ? 'zh' : 'en',
    prompt: null,
    train: null,
    error: null // New: Error Hint
  };

  // === 日志国际化字典 ===
  const LOG_MSGS = {
    auto_filled: {
      en: "Auto-filled initial Prompt",
      zh: "已自动填充初始 Prompt"
    },
    captured: {
      en: "Captured Call",
      zh: "捕获调用"
    },
    args: {
      en: "Args",
      zh: "参数"
    },
    exec_success: {
      en: "Execution Success",
      zh: "执行成功"
    },
    exec_fail: {
      en: "Execution Failed",
      zh: "执行失败"
    },
    training_hint: {
      en: "Added periodic training note",
      zh: "已附加定期复训提示"
    },
    input_not_found: {
      en: "Input box not found!",
      zh: "找不到输入框!"
    },
    result_written: {
      en: "Result written back to input",
      zh: "结果已回填至输入框"
    },
    send_success_cleared: {
      en: "Send success (Input cleared)",
      zh: "发送成功 (输入框已清空)"
    },
    send_btn_missing: {
      en: "Send button not found...",
      zh: "未找到发送按钮..."
    },
    send_btn_disabled: {
      en: "Send button disabled (UI not updated)...",
      zh: "发送按钮仍被禁用 (UI未更新)..."
    },
    auto_send_attempt: {
      en: "Attempting auto-send",
      zh: "尝试自动发送"
    },
    auto_send_timeout: {
      en: "Auto-send timed out, please click manually",
      zh: "自动发送超时，请手动点击发送"
    },
    config_updated: {
      en: "Selectors config updated",
      zh: "选择器配置已更新"
    }
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

  // === 悬浮日志系统 (省略, 未变) ===
  const Logger = {
    el: null,
    contentEl: null,

    init() {
      if (this.el) return;
      this.el = document.createElement("div");
      Object.assign(this.el.style, {
        position: "fixed",
        top: "20px",
        right: "20px",
        width: "320px",
        height: "200px",
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        color: "#00ff00",
        fontFamily: "Consolas, Monaco, monospace",
        fontSize: "12px",
        zIndex: "99999",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        display: "none",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid #333",
        backdropFilter: "blur(4px)",
      });

      const header = document.createElement("div");
      Object.assign(header.style, {
        padding: "4px 10px", // 稍微改小一点给 status 让位
        backgroundColor: "#333",
        color: "#fff",
        cursor: "move",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontWeight: "bold",
        userSelect: "none",
      });
      header.innerText = "WebMCP Bridge Process Log";

      const clearBtn = document.createElement("span");
      clearBtn.innerText = "🗑️";
      clearBtn.style.cursor = "pointer";
      clearBtn.onclick = () => (this.contentEl.innerHTML = "");
      header.appendChild(clearBtn);

      // [New] Status Bar for Token Count
      this.statusEl = document.createElement("div");
      Object.assign(this.statusEl.style, {
          padding: "4px 10px",
          backgroundColor: "#2d2d2d",
          borderBottom: "1px solid #444",
          fontSize: "11px",
          color: "#4fc3f7",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
      });
      this.statusEl.innerText = "Initializing...";

      this.contentEl = document.createElement("div");
      Object.assign(this.contentEl.style, {
        flex: "1",
        overflowY: "auto",
        padding: "8px",
        wordBreak: "break-all",
      });

      this.el.appendChild(header);
      this.el.appendChild(this.statusEl);
      this.el.appendChild(this.contentEl);
      document.body.appendChild(this.el);

      this.makeDraggable(header);
    },

    makeDraggable(headerEl) {
      let isDragging = false;
      let startX, startY, initialLeft, initialTop;
      headerEl.addEventListener("mousedown", (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.el.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
      });
      window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        this.el.style.left = `${initialLeft + dx}px`;
        this.el.style.top = `${initialTop + dy}px`;
        this.el.style.right = "auto";
      });
      window.addEventListener("mouseup", () => { isDragging = false; });
    },

    toggle(show) {
      if (!this.el && show) this.init();
      if (this.el) {
          this.el.style.display = show ? "flex" : "none";
      }
    },

    updateStatus(text) {
        if (this.statusEl) this.statusEl.innerText = text;
    },

    log(msg, type = "info") {
      if (!this.el || this.el.style.display === "none") return;

      const line = document.createElement("div");
      const time = new Date().toLocaleTimeString("en-US", { hour12: false });
      line.style.marginBottom = "4px";
      line.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
      line.style.paddingBottom = "2px";

      let icon = "🔹";
      let color = "#ddd";
      if (type === "success") { icon = "✅"; color = "#4caf50"; }
      if (type === "error") { icon = "❌"; color = "#f44336"; }
      if (type === "warn") { icon = "⚠️"; color = "#ff9800"; }
      if (type === "action") { icon = "⚡"; color = "#00bcd4"; }

      line.innerHTML = `<span style="color:#888; font-size:10px">[${time}]</span> ${icon} <span style="color:${color}">${msg}</span>`;
      this.contentEl.appendChild(line);
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    },
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'TOGGLE_LOG') {
          Logger.toggle(request.show);
          Logger.log("Logger Visible: " + request.show, "info");
      }
  });

  // === 选择器管理 ===
  let activeSelectors = DEFAULT_SELECTORS; // 使用全局变量
  let DOM = null;
  const currentPlatform = location.host.includes("deepseek") ? "deepseek" : location.host.includes("gemini") ? "gemini" : "chatgpt";
  console.log(`[MCP Extension] Started on ${currentPlatform}`);

  function updateDOMConfig() {
      if (activeSelectors && activeSelectors[currentPlatform]) {
          DOM = activeSelectors[currentPlatform];
          console.log(`[MCP] DOM Selectors updated for ${currentPlatform}`);
      }
  }

  // === 初始化配置 ===
  chrome.storage.sync.get(
    ["autoSend", "autoPromptEnabled", "customSelectors"],
    (items) => {
      CONFIG.autoSend = items.autoSend ?? true;
      CONFIG.autoPromptEnabled = items.autoPromptEnabled ?? false;
      if (items.customSelectors) {
          activeSelectors = items.customSelectors;
      }
      updateDOMConfig();
      console.log("[MCP] Config Loaded:", CONFIG);
    }
  );

  // === Token 统计管理器 ===
  const TokenManager = {
    CACHE_KEY: "mcp_token_stats",
    CLEANUP_MS: 10 * 24 * 60 * 60 * 1000, // 10天过期
    data: {},
    currentChatId: null,
    sessionBaseDOM: 0,
    sessionBaseTotal: 0,
    lastSave: 0,

    async init() {
        const stored = await chrome.storage.local.get(this.CACHE_KEY);
        this.data = stored[this.CACHE_KEY] || {};
        this.cleanup();
        console.log("[WebMCP] TokenManager initialized");
    },

    cleanup() {
        const now = Date.now();
        let changed = false;
        for (const [id, stat] of Object.entries(this.data)) {
            if (now - stat.timestamp > this.CLEANUP_MS) {
                delete this.data[id];
                changed = true;
            }
        }
        if (changed) this.save(true);
    },

    getChatId() {
        const url = location.href;
        // DeepSeek: /chat/s/UUID or /a/chat/s/UUID
        const ds = url.match(/\/chat\/s\/([a-f0-9-]+)/);
        if (ds) return ds[1];
        // ChatGPT: /c/UUID
        const gpt = url.match(/\/c\/([a-f0-9-]+)/);
        if (gpt) return gpt[1];
        // Gemini: /app/UUID
        const gemini = url.match(/\/app\/([a-f0-9]+)/);
        if (gemini) return gemini[1];
        return null;
    },

    estimate(text) {
        if (!text) return 0;
        const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const other = text.length - chinese;
        // 估算: 中文 0.7, 其他 0.25
        return Math.ceil(chinese * 0.7 + other * 0.25);
    },

    update() {
        if (!DOM) return;
        const chatId = this.getChatId();
        if (!chatId) {
            Logger.updateStatus("Token Tracker: No active chat detected");
            return;
        }

        // 计算当前 DOM Token
        let text = "";
        
        // 1. AI 消息 & 通用消息块
        const aiBlocks = document.querySelectorAll(DOM.messageBlocks);
        aiBlocks.forEach(b => text += b.innerText + "\n");

        // 2. 用户消息 (如果配置了独立选择器)
        if (DOM.userMessageBlocks) {
            const userBlocks = document.querySelectorAll(DOM.userMessageBlocks);
            userBlocks.forEach(b => text += b.innerText + "\n");
        }

        // Fallback: 如果都没找到，用 body 近似值
        if (text.length === 0) {
             text = document.body.innerText;
        }
        const currentDOM = this.estimate(text);

        // 切换 ID 或初始化时的基准校准
        if (chatId !== this.currentChatId) {
            this.currentChatId = chatId;
            const saved = this.data[chatId];
            
            if (saved) {
                this.sessionBaseTotal = saved.count;
            } else {
                this.sessionBaseTotal = 0;
            }
            this.sessionBaseDOM = currentDOM;

            // 修正: 如果是第一次加载老会话(DOM > Saved)，信任 DOM
            if (this.sessionBaseDOM > this.sessionBaseTotal) {
                this.sessionBaseTotal = this.sessionBaseDOM;
            }
        }

        // 增量计算: Total = SavedBase + (CurrentDOM - BaseDOM)
        // 注意: 即使 delta 为负(删除消息)，也不应该让 total 小于 currentDOM
        let delta = currentDOM - this.sessionBaseDOM;
        let newTotal = this.sessionBaseTotal + delta;
        if (newTotal < currentDOM) newTotal = currentDOM;

        // 更新缓存
        this.data[chatId] = {
            count: newTotal,
            timestamp: Date.now(),
            platform: currentPlatform
        };

        // UI 显示
        const limit = location.host.includes("google") ? 1000000 : 128000;
        const pct = ((newTotal / limit) * 100).toFixed(1);
        Logger.updateStatus(`📊 Context: ${newTotal.toLocaleString()} / ${limit.toLocaleString()} (${pct}%) (Est.)`);

        // 这里的保存做了简单节流，每5秒存一次
        this.save();
    },

    save(force = false) {
        const now = Date.now();
        if (force || now - this.lastSave > 5000) {
            chrome.storage.local.set({ [this.CACHE_KEY]: this.data });
            this.lastSave = now;
        }
    }
  };
  
  // 启动 TokenManager
  TokenManager.init();

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync") {
      if (changes.autoSend) CONFIG.autoSend = changes.autoSend.newValue;
      if (changes.autoPromptEnabled) CONFIG.autoPromptEnabled = changes.autoPromptEnabled.newValue;
      if (changes.customSelectors) {
          activeSelectors = changes.customSelectors.newValue;
          updateDOMConfig();
          Logger.log(t("config_updated"), "action");
      }
    }
  });

  // === 主逻辑 ===
  const processedRequests = new Set();
  const blockStates = new WeakMap(); // 用于追踪代码块变化的 WeakMap
  const STABILIZATION_TIMEOUT = 3000; // 3秒无变化且解析失败，则报错
  let toolCallCount = 0;
  let autoSendTimer = null;

  setInterval(() => {
    if (!DOM) return;
    
    // 更新 Token 统计
    TokenManager.update();

    const messages = document.querySelectorAll(DOM.messageBlocks);
    if (messages.length === 0) {
      const inputEl = document.querySelector(DOM.inputArea);
      if (inputEl && CONFIG.autoPromptEnabled && inputEl.textContent.trim() === "") {
          if (i18n.prompt) {
            inputEl.innerText = i18n.prompt;
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            Logger.log(t("auto_filled"), "action");
          }
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const codeElements = lastMessage.querySelectorAll(DOM.codeBlocks);

    codeElements.forEach((codeEl) => {
      const textContent = codeEl.textContent.trim();
      if (!textContent.includes('"mcp_action": "call"')) return;

      try {
        const payload = JSON.parse(textContent);
        // 解析成功，清除该块的错误状态记录（如果有）
        if (blockStates.has(codeEl)) blockStates.delete(codeEl);
        if (codeEl.style.borderColor === "rgb(244, 67, 54)") codeEl.style.border = "none"; // 清除红色边框

        if (payload.mcp_action === "call" && payload.request_id) {
          if (processedRequests.has(payload.request_id)) {
            if (codeEl.dataset.mcpVisual !== "true") markVisualSuccess(codeEl);
            return;
          }

          processedRequests.add(payload.request_id);
          markVisualSuccess(codeEl);

          Logger.log(`${t("captured")}: ${payload.name}`, "info");
          Logger.log(`${t("args")}: ${JSON.stringify(payload.arguments).substring(0, 50)}...`, "info");

          // [New] Virtual Tool: Task Completion Notification
          if (payload.name === "task_completion_notification") {
             const msg = payload.arguments?.message || "Task Completed";
             Logger.log(`🔔 Notification: ${msg}`, "action");
             chrome.runtime.sendMessage({ type: "SHOW_NOTIFICATION", title: "WebMCP Task Finished", message: msg });
             // 直接返回，不回填输入框
             return;
          }

          chrome.runtime.sendMessage({ type: "EXECUTE_TOOL", payload: payload }, (response) => {
            if (response && response.success) {
              Logger.log(`${t("exec_success")}: ${payload.name}`, "success");
              
              // [New] Inject Virtual Tool into list_tools response
              let finalData = response.data;
              if (payload.name === "list_tools") {
                  try {
                      const tools = JSON.parse(finalData);
                      tools.push({
                          name: "task_completion_notification",
                          description: "Notify the user that a long-running task or a series of complex operations is complete. Use this when you need the user's attention to review your work or provide new instructions. Calling this will trigger a system notification on the user's device.",
                          inputSchema: {
                              type: "object",
                              properties: {
                                  message: {
                                      type: "string",
                                      description: "Short summary of what was completed (e.g. 'Analysis of 50 files finished')."
                                  }
                              },
                              required: ["message"]
                          }
                      });
                      finalData = JSON.stringify(tools, null, 2);
                  } catch (e) {
                      console.error("Failed to inject virtual tool", e);
                  }
              }

              sendResponseToChat(payload.request_id, finalData);
            } else {
              Logger.log(`${t("exec_fail")}: ${response.error}`, "error");
              sendResponseToChat(payload.request_id, `❌ Error: ${response.error}`);
            }
          });
        }
      } catch (e) {
        // === 智能防抖错误检测 ===
        const now = Date.now();
        let state = blockStates.get(codeEl);

        if (!state || state.text !== textContent) {
            // 内容发生了变化（正在生成中），或者第一次遇到此块
            // 更新状态，重置计时器，并移除可能的错误样式（因为可能正在修正）
            blockStates.set(codeEl, { text: textContent, time: now, errorNotified: false });
            if (codeEl.style.borderColor === "rgb(244, 67, 54)") {
                codeEl.style.border = "none";
            }
        } else {
            // 内容没有变化（可能卡住了或生成完毕）
            if (now - state.time > STABILIZATION_TIMEOUT && !state.errorNotified) {
                // 超过 N 秒没变，且依然解析失败 -> 确认为错误
                Logger.log("JSON Parse Error (Stable): " + e.message, "error");
                codeEl.style.border = "2px solid #F44336"; // Red Border
                chrome.runtime.sendMessage({ type: "SHOW_NOTIFICATION", title: "WebMCP Error", message: "Invalid JSON format (Stuck)." });
                
                // 标记已通知，避免重复弹窗
                state.errorNotified = true;
                blockStates.set(codeEl, state);
            }
        }
      }
    });
  }, CONFIG.pollInterval);

  function markVisualSuccess(element) {
    element.dataset.mcpVisual = "true";
    element.style.border = "2px solid #00E676";
    element.style.borderRadius = "4px";
  }

  function sendResponseToChat(requestId, outputContent) {
    toolCallCount++;
    const responseJson = {
      mcp_action: "result",
      request_id: requestId,
      status: "success",
      output: outputContent,
    };

    if (toolCallCount > 0 && toolCallCount % 5 === 0) {
        if (i18n.train) {
             responseJson.system_note = i18n.train;
             Logger.log(t("training_hint") + " (Train/i18n)", "info");
        } else {
             responseJson.system_note = `[System] Reminder: Tool calls MUST use this JSON format: {"mcp_action":"call", "name": "tool_name", "arguments": {...}}.`;
        }
    }

    const replyText = `\`\`\`json\n${JSON.stringify(responseJson, null, 2)}\n\`\`\``;
    const inputEl = document.querySelector(DOM.inputArea);
    if (!inputEl) { Logger.log(t("input_not_found"), "error"); return; }

    let currentText = inputEl.innerText || inputEl.value || "";
    currentText = currentText.replace(/\r\n/g, "\n").replace(/\n+/g, "\n").trim();
    const separator = currentText ? "\n\n" : "";
    const finalText = currentText + separator + replyText;

    inputEl.focus();
    let success = false;
    try {
        document.execCommand('selectAll', false, null);
        success = document.execCommand('insertText', false, finalText);
    } catch (e) {}

    if (!success) {
        if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
            inputEl.value = finalText;
        } else {
            inputEl.innerText = finalText;
        }
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    Logger.log(t("result_written"), "action");

    if (CONFIG.autoSend) {
      // Debounce: Clear previous pending retry
      if (autoSendTimer) {
          clearTimeout(autoSendTimer);
          autoSendTimer = null;
      }

      let retryCount = 0;
      const maxRetries = 5;
      const trySend = () => {
        const btn = document.querySelector(DOM.sendButton);
        const currentVal = inputEl.value || inputEl.innerText || "";
        if (currentVal.trim().length === 0) { Logger.log(t("send_success_cleared"), "success"); return; }

        if (inputEl) {
            inputEl.focus();
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
  }
})();