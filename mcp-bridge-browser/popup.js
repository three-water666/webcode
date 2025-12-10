document.addEventListener("DOMContentLoaded", async () => {
  const connectedView = document.getElementById("connectedView");
  const disconnectedView = document.getElementById("disconnectedView");
  const statusDot = document.getElementById("statusDot");
  const portDisplay = document.getElementById("portDisplay");
  const copyPromptBtn = document.getElementById("copyPromptBtn");
  const autoSendInput = document.getElementById("autoSend");
  const showLogInput = document.getElementById("showLog");
  const availableView = document.getElementById("availableView");
  const gatewayList = document.getElementById("gatewayList");

  // 1. 语言检测与资源加载
  const isZh = navigator.language.startsWith("zh");
  const promptKey = isZh ? "prompt_zh" : "prompt_en";

  // 获取当前 Tab ID
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTabId = tabs[0] ? tabs[0].id : null;

  if (!currentTabId) return;

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
        const manifest = chrome.runtime.getManifest();
        const hostPatterns = manifest.host_permissions || [];
        const scriptPatterns = (manifest.content_scripts || []).flatMap(
          (cs) => cs.matches || []
        );
        const patterns = [...new Set([...hostPatterns, ...scriptPatterns])];
        const currentUrl = tabs[0].url || "";

        const isAllowed = patterns.some((pattern) => {
          // 1. 去掉末尾的通配符 *
          const base = pattern.replace(/\*$/, "");
          // 2. 宽松匹配：URL 以 base 开头，或者 URL 等于 base (去掉末尾斜杠的情况)
          // 例如 pattern: https://a.com/* -> base: https://a.com/
          // 匹配: https://a.com/foo (startsWith ✔️)
          // 匹配: https://a.com (base.slice(0,-1) === url ✔️)
          return (
            currentUrl.startsWith(base) ||
            currentUrl === base.replace(/\/$/, "")
          );
        });

        if (!isAllowed) {
          availableView.classList.add("hidden");
          disconnectedView.classList.remove("hidden");
          return;
        }

        // Scan for existing gateways
        chrome.storage.local.get(null, (items) => {
          const uniqueGateways = new Map();
          for (const [key, val] of Object.entries(items)) {
            if (key.startsWith("session_") && val.port && val.token) {
              uniqueGateways.set(val.port, val.token);
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
                    if (res && res.success) window.close(); // Close popup on success
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
      }
    }
  );

  // 2. 复制逻辑：动态读取对应语言的 Prompt
  copyPromptBtn.addEventListener("click", () => {
    chrome.storage.local.get([promptKey], (items) => {
      const promptContent = items[promptKey];
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
