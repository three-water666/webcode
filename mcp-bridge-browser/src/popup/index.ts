import { Session } from '../types';

document.addEventListener("DOMContentLoaded", async () => {
  const connectedView = document.getElementById("connectedView") as HTMLElement;
  const disconnectedView = document.getElementById("disconnectedView") as HTMLElement;
  const statusDot = document.getElementById("statusDot") as HTMLElement;
  const portDisplay = document.getElementById("portDisplay") as HTMLElement;
  const copyPromptBtn = document.getElementById("copyPromptBtn") as HTMLButtonElement;
  const copyInitBtn = document.getElementById("copyInitBtn") as HTMLButtonElement;
  const openOptionsBtn = document.getElementById("openOptionsBtn") as HTMLButtonElement;
  const autoSendInput = document.getElementById("autoSend") as HTMLInputElement;
  const showLogInput = document.getElementById("showLog") as HTMLInputElement;
  const availableView = document.getElementById("availableView") as HTMLElement;
  const gatewayList = document.getElementById("gatewayList") as HTMLElement;

  // 1. 语言检测与资源加载
  const isZh = navigator.language.startsWith("zh");
  const promptKey = isZh ? "prompt_zh" : "prompt_en";
  const initKey = isZh ? "init_zh" : "init_en";

  // 获取当前 Tab ID
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTabId = tabs[0] ? tabs[0].id : null;

  if (!currentTabId) {return;}

  // 向 Background 查询状态
  chrome.runtime.sendMessage(
    { type: "GET_STATUS", tabId: currentTabId },
    (response) => {
      if (response && response.connected) {
        connectedView.classList.remove("hidden");
        disconnectedView.classList.add("hidden");
        statusDot.classList.add("online");
        portDisplay.innerText = response.port;

        // 回填 Log 开关状态
        showLogInput.checked = response.showLog;
      } else {
        connectedView.classList.add("hidden");
        statusDot.classList.remove("online");

        // [Security] Only scan if URL is allowed
        const currentUrl = tabs[0].url || "";

        // Helper matching the logic from background
        const getBaseUrl = (url: string) => {
          try {
            const u = new URL(url);
            return u.origin + u.pathname;
          } catch {
            return url;
          }
        };

        const checkSafety = async () => {
          if (currentUrl.startsWith('http://127.0.0.1:') || currentUrl.startsWith('http://localhost:')) {
            return true;
          }

          const localItems = await chrome.storage.local.get(["syncedAiSites"]);
          const sites = localItems.syncedAiSites || [];
          const fallbackWhitelist = [
            "https://chatgpt.com",
            "https://gemini.google.com",
            "https://aistudio.google.com",
            "https://chat.deepseek.com",
            "https://chat.openai.com"
          ];

          const baseUrl = getBaseUrl(currentUrl);
          const inDynamic = sites.some((site: any) => baseUrl.startsWith(site.address));
          const inFallback = fallbackWhitelist.some(fb => baseUrl.startsWith(fb));

          return inDynamic || inFallback;
        };

        checkSafety().then(isAllowed => {
          if (!isAllowed) {
            availableView.classList.add("hidden");
            disconnectedView.classList.remove("hidden");
            return;
          }

          // Scan for existing gateways
          chrome.storage.local.get(null, (items) => {
            const uniqueGateways = new Map<number, string>();
            for (const [key, val] of Object.entries(items)) {
              if (key.startsWith("session_") && (val as Session).port && (val as Session).token) {
                uniqueGateways.set((val as Session).port, (val as Session).token);
              }
            }

            if (uniqueGateways.size > 0) {
              availableView.classList.remove("hidden");
              disconnectedView.classList.add("hidden");
              gatewayList.innerHTML = "";

              uniqueGateways.forEach((token, port) => {
                const btn = document.createElement("button");
                btn.className = "btn";
                btn.style.marginBottom = "8px";
                btn.style.display = "flex";
                btn.style.justifyContent = "space-between";
                btn.innerHTML = `<span>🔗 Connect to <b>${port}</b></span> <span>⚡</span>`;
                btn.onclick = () => {
                  chrome.runtime.sendMessage(
                    {
                      type: "CONNECT_EXISTING",
                      port,
                      token,
                      tabId: currentTabId,
                    },
                    (res) => {
                      if (res && res.success) {window.close();} // Close popup on success
                    }
                  );
                };
                gatewayList.appendChild(btn);
              });
            } else {
              availableView.classList.add("hidden");
              disconnectedView.classList.remove("hidden");
            }
          });
        });
      }
    }
  );

  // 2. 复制逻辑：动态读取对应语言的 Prompt
  copyPromptBtn.addEventListener("click", () => {
    // [Fix] 同时获取基础提示词和用户规则
    // ⚠️ 存储键是 user_rules (带下划线), 修正
    chrome.storage.local.get([promptKey, "user_rules"], (items) => {
      let promptContent = items[promptKey];
      const userRules = items.user_rules || "";

      if (promptContent && userRules) {
        // 拼接用户规则
        promptContent = `${promptContent}\n\n--- [User Rules] ---\n${userRules}`;
      }
      if (promptContent) {
        navigator.clipboard.writeText(promptContent).then(() => {
          const originalText = copyPromptBtn.innerText;
          copyPromptBtn.innerText = "Copied!";
          copyPromptBtn.style.backgroundColor = "#0d8a6a";
          setTimeout(() => {
            copyPromptBtn.innerText = originalText;
            copyPromptBtn.style.backgroundColor = "";
          }, 1500);
        });
      } else {
        copyPromptBtn.innerText = "Prompt Not Found";
      }
    });
  });

  // 3. 复制初始化命令 Prompt
  copyInitBtn.addEventListener("click", () => {
    chrome.storage.local.get([initKey], (items) => {
      const initContent = items[initKey];
      if (initContent) {
        navigator.clipboard.writeText(initContent).then(() => {
          const originalText = copyInitBtn.innerText;
          copyInitBtn.innerText = "Copied! Add to AI Memory";
          copyInitBtn.style.backgroundColor = "#0d8a6a";
          setTimeout(() => {
            copyInitBtn.innerText = originalText;
            copyInitBtn.style.backgroundColor = "";
          }, 3000);
        });
      } else {
        copyInitBtn.innerText = "Init Prompt Not Found";
      }
    });
  });

  // Open Options Page
  openOptionsBtn?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Auto Send (Global Config)
  chrome.storage.sync.get(["autoSend"], (items) => {
    autoSendInput.checked =
      items.autoSend !== undefined ? items.autoSend : true;
  });
  autoSendInput.addEventListener("change", () => {
    chrome.storage.sync.set({ autoSend: autoSendInput.checked });
  });

  // Log Toggle (Tab Session)
  showLogInput.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      type: "SET_LOG_VISIBLE",
      tabId: currentTabId,
      show: showLogInput.checked,
    });
  });
});