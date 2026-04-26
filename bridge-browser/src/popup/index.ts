import { type Session } from '../types';
import { BRANDING } from '@webcode/shared';

document.addEventListener("DOMContentLoaded", async () => {
  const lang = navigator.language.startsWith("zh") ? "zh" : "en";
  const UI: Record<string, Record<string, string>> = {
    en: {
      title: BRANDING.bridgeName,
      connected_text: "✅ Connected to VS Code",
      port_label: "Port",
      copy_init: "Copy Initialization Prompt",
      copy_init_title: "Copy the initialization prompt",
      auto_send: "Auto Send Message",
      show_log: "Show Floating Log",
      available_gateways: "⚡ Available Gateways",
      disconnected: "🔴 Disconnected",
      installed_title: "👉 Already Installed?",
      installed_desc: `Click ${BRANDING.productName} in the VS Code status bar (bottom right) and follow the steps to launch.`,
      not_installed_title: "👉 Not Installed?",
      marketplace_hint: "Search in VS Code Marketplace:",
      connect_to: "Connect to",
      copied_init: "Initialization prompt copied",
      init_missing: "Init Prompt Not Found",
    },
    zh: {
      title: BRANDING.bridgeName,
      connected_text: "✅ 已连接到 VS Code",
      port_label: "端口",
      copy_init: "复制初始化提示词",
      copy_init_title: "复制初始化提示词",
      auto_send: "自动发送消息",
      show_log: "显示悬浮日志",
      available_gateways: "⚡ 可用网关",
      disconnected: "🔴 未连接",
      installed_title: "👉 已安装？",
      installed_desc: `点击 VS Code 右下角状态栏中的 ${BRANDING.productName}，并按提示启动服务。`,
      not_installed_title: "👉 未安装？",
      marketplace_hint: "在 VS Code 扩展市场中搜索：",
      connect_to: "连接到",
      copied_init: "初始化提示词已复制",
      init_missing: "未找到初始化提示词",
    },
  };
  const t = (key: string) => UI[lang][key] || UI.en[key];

  const connectedView = document.getElementById("connectedView") as HTMLElement;
  const disconnectedView = document.getElementById("disconnectedView") as HTMLElement;
  const statusDot = document.getElementById("statusDot") as HTMLElement;
  const portDisplay = document.getElementById("portDisplay") as HTMLElement;
  const copyInitBtn = document.getElementById("copyInitBtn") as HTMLButtonElement;
  const autoSendInput = document.getElementById("autoSend") as HTMLInputElement;
  const showLogInput = document.getElementById("showLog") as HTMLInputElement;
  const availableView = document.getElementById("availableView") as HTMLElement;
  const gatewayList = document.getElementById("gatewayList") as HTMLElement;
  const initKey = lang === "zh" ? "init_zh" : "init_en";

  const title = document.getElementById("title") as HTMLElement;
  const connectedText = document.getElementById("connectedText") as HTMLElement;
  const portLabel = document.getElementById("portLabel") as HTMLElement;
  const autoSendLabel = document.getElementById("autoSendLabel") as HTMLElement;
  const showLogLabel = document.getElementById("showLogLabel") as HTMLElement;
  const availableGateways = document.getElementById("availableGateways") as HTMLElement;
  const disconnectedTitle = document.getElementById("disconnectedTitle") as HTMLElement;
  const installedTitle = document.getElementById("installedTitle") as HTMLElement;
  const installedDesc = document.getElementById("installedDesc") as HTMLElement;
  const notInstalledTitle = document.getElementById("notInstalledTitle") as HTMLElement;
  const marketplaceHint = document.getElementById("marketplaceHint") as HTMLElement;

  function initUI() {
    title.textContent = t("title");
    connectedText.textContent = t("connected_text");
    portLabel.textContent = t("port_label");
    copyInitBtn.textContent = t("copy_init");
    copyInitBtn.title = t("copy_init_title");
    autoSendLabel.textContent = t("auto_send");
    showLogLabel.textContent = t("show_log");
    availableGateways.innerHTML = `<span>⚡</span> ${t("available_gateways").replace(/^⚡\s*/, "")}`;
    disconnectedTitle.textContent = t("disconnected");
    installedTitle.textContent = t("installed_title");
    installedDesc.innerHTML = `${t("installed_desc").replace(BRANDING.productName, `<span style="color: #3498db; font-weight: bold">${BRANDING.productName}</span>`)}`;
    notInstalledTitle.textContent = t("not_installed_title");
    marketplaceHint.textContent = t("marketplace_hint");
  }

  initUI();

  // 获取当前 Tab ID
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTabId = tabs[0] ? tabs[0].id : null;

  if (!currentTabId) {return;}

  // 向 Background 查询状态
  chrome.runtime.sendMessage(
    { type: "GET_STATUS", tabId: currentTabId },
    (response) => {
      if (response?.connected) {
        connectedView.classList.remove("hidden");
        disconnectedView.classList.add("hidden");
        statusDot.classList.add("online");
        portDisplay.innerText = response.port;

        // 回填 Log 开关状态
        showLogInput.checked = response.showLog;
      } else {
        connectedView.classList.add("hidden");
        statusDot.classList.remove("online");

        // [Security] Manual attach is only available on normal web pages
        const currentUrl = tabs[0].url ?? "";

        // eslint-disable-next-line @typescript-eslint/require-await
        const checkSafety = async () => {
          if (currentUrl.startsWith('http://127.0.0.1:') || currentUrl.startsWith('http://localhost:')) {
            return true;
          }

          return currentUrl.startsWith('https://') || currentUrl.startsWith('http://');
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
                btn.innerHTML = `<span>🔗 ${t("connect_to")} <b>${port}</b></span> <span>⚡</span>`;
                btn.onclick = () => {
                  chrome.runtime.sendMessage(
                    {
                      type: "CONNECT_EXISTING",
                      port,
                      token,
                      tabId: currentTabId,
                      targetOrigin: (() => {
                        try {
                          return new URL(currentUrl).origin;
                        } catch {
                          return undefined;
                        }
                      })(),
                    },
                    (res) => {
                      if (res?.success) {window.close();} // Close popup on success
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

  // 2. 复制初始化提示词
  copyInitBtn.addEventListener("click", () => {
    chrome.storage.local.get([initKey], (items) => {
      const initContent = items[initKey];
      if (initContent) {
        navigator.clipboard.writeText(initContent).then(() => {
          const originalText = copyInitBtn.innerText;
          copyInitBtn.innerText = t("copied_init");
          copyInitBtn.style.backgroundColor = "#0d8a6a";
          setTimeout(() => {
            copyInitBtn.innerText = originalText;
            copyInitBtn.style.backgroundColor = "";
          }, 3000);
        });
      } else {
        copyInitBtn.innerText = t("init_missing");
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
