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
        padding: "6px 10px",
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

      this.contentEl = document.createElement("div");
      Object.assign(this.contentEl.style, {
        flex: "1",
        overflowY: "auto",
        padding: "8px",
        wordBreak: "break-all",
      });

      this.el.appendChild(header);
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

  // === SSE 上下文注入系统 ===
  let sseSource = null;
  
  function setupSSE(port, token) {
      if (sseSource && sseSource.readyState !== 2) {
          console.log("[WebMCP] SSE already active.");
          return;
      }
      if (sseSource) sseSource.close();

      const url = `http://127.0.0.1:${port}/events?token=${token}`;
      sseSource = new EventSource(url);

      sseSource.onmessage = (event) => {
          try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'inject_context') {
                  Logger.log("📥 Received Context from VS Code", "action");
                  
                  // 1. 请求唤醒窗口
                  chrome.runtime.sendMessage({ type: "ACTIVATE_TAB" });

                  // 2. 延迟执行，给浏览器一点时间恢复 DOM 渲染
                  setTimeout(() => {
                      injectContextToInput(msg.data.text);
                  }, 300);
              }
          } catch (e) { console.error(e); }
      };

      sseSource.onerror = (e) => {
          sseSource.close();
          sseSource = null;
      };
      Logger.log(`📡 Listening for VS Code events`, "info");
  }

  function injectContextToInput(text) {
      const inputEl = document.querySelector(DOM.inputArea);
      if (!inputEl) {
          Logger.log(t("input_not_found"), "error");
          return;
      }

      // 1. 填入文本
      inputEl.focus();
      let success = false;
      try {
          document.execCommand('selectAll', false, null);
          success = document.execCommand('insertText', false, text);
      } catch (e) {}
      
      if (!success) {
          if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
              inputEl.value = text;
          } else {
              inputEl.innerText = text;
          }
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // 2. 自动发送 (如果配置允许)
      if (CONFIG.autoSend) {
          setTimeout(() => {
              const btn = document.querySelector(DOM.sendButton);
              if (btn && !btn.disabled) {
                  btn.click();
                  Logger.log("🚀 Auto-sent context request", "success");
              }
          }, 500);
      }
  }

  // 监听 Session 变化以建立 SSE
  chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
          for (const key in changes) {
              // 简单的模糊匹配，因为没办法直接拿到当前 tabId
              if (key.startsWith('session_')) {
                  const newVal = changes[key].newValue;
                  if (newVal && newVal.port && newVal.token) {
                      // 尝试连接 (这里假设用户只连了一个 VS Code 实例)
                      setupSSE(newVal.port, newVal.token);
                  }
              }
          }
      }
  });

  // 初始化时尝试连接一次
  chrome.storage.local.get(null, (items) => {
      for (const [key, val] of Object.entries(items)) {
          if (key.startsWith('session_') && val.port && val.token) {
              setupSSE(val.port, val.token);
              break; // 只连第一个找到的 session
          }
      }
  });

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
  let toolCallCount = 0;

  setInterval(() => {
    if (!DOM) return;

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
        if (payload.mcp_action === "call" && payload.request_id) {
          if (processedRequests.has(payload.request_id)) {
            if (codeEl.dataset.mcpVisual !== "true") markVisualSuccess(codeEl);
            return;
          }

          processedRequests.add(payload.request_id);
          markVisualSuccess(codeEl);

          Logger.log(`${t("captured")}: ${payload.name}`, "info");
          Logger.log(`${t("args")}: ${JSON.stringify(payload.arguments).substring(0, 50)}...`, "info");

          chrome.runtime.sendMessage({ type: "EXECUTE_TOOL", payload: payload }, (response) => {
            if (response && response.success) {
              Logger.log(`${t("exec_success")}: ${payload.name}`, "success");
              sendResponseToChat(payload.request_id, response.data);
            } else {
              Logger.log(`${t("exec_fail")}: ${response.error}`, "error");
              sendResponseToChat(payload.request_id, `❌ Error: ${response.error}`);
            }
          });
        }
      } catch (e) {}
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
      let retryCount = 0;
      const maxRetries = 10;
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
        } else {
           // === 后台救援机制 ===
           if (document.visibilityState === 'hidden' && retryCount > 1) {
               Logger.log("⚠️ Background throttling detected! Requesting Focus...", "warn");
               chrome.runtime.sendMessage({ type: "ACTIVATE_TAB" });
               // 唤醒后，给浏览器一点时间重绘，重置重试计数器以便下次循环成功点击
               retryCount = 0; 
               return;
           }

           if (!btn) Logger.log(t("send_btn_missing"), "warn");
           else Logger.log(t("send_btn_disabled"), "warn");
        }

        retryCount++;
        if (retryCount < maxRetries) setTimeout(trySend, 2000);
        else Logger.log(t("auto_send_timeout"), "error");
      };
      setTimeout(trySend, 1000);
    }
  }
})();