import { HandshakeResponse } from '../types';

(function () {
  const isZh = navigator.language.toLowerCase().startsWith("zh");
  const i18n = isZh ? {
    invalidLinkParameters: "链接参数无效",
    extensionNotDetectedTitle: "❌ 未检测到扩展",
    extensionNotDetectedDesc: "请确认已安装并启用 “WebMCP Bridge” 浏览器扩展。",
    connectedRedirecting: "✅ 已连接，正在跳转...",
    connectionConflictTitle: "⚠️ 连接冲突",
    connectionConflictBody: (port: number) => `VS Code（端口 ${port}）当前已连接到另一个标签页。<br>要切换到这个页面吗？`,
    connectHere: "是的，连接到这里",
    switchingConnection: "正在切换连接...",
    connectionFailed: (message: string) => `连接失败：${message}`,
    unknownError: "未知错误",
  } : {
    invalidLinkParameters: "Invalid Link Parameters",
    extensionNotDetectedTitle: "❌ Extension Not Detected",
    extensionNotDetectedDesc: "Please ensure 'WebMCP Bridge' extension is installed and enabled.",
    connectedRedirecting: "✅ Connected! Redirecting...",
    connectionConflictTitle: "⚠️ Connection Conflict",
    connectionConflictBody: (port: number) => `VS Code (Port ${port}) is already connected to another tab.<br>Do you want to switch the connection here?`,
    connectHere: "Yes, Connect Here",
    switchingConnection: "Switching connection...",
    connectionFailed: (message: string) => `Connection Failed: ${message}`,
    unknownError: "Unknown Error",
  };

  // === 核心修复：等待 DOM 加载完成 ===
  // 标记插件已安装，供页面检测
  document.documentElement.setAttribute("data-extension-installed", "true");

  function startHandshake() {
    console.log("[WebMCP] Bridge starting handshake...");

    // 1. 从 URL 获取参数
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const target = params.get("target");
    const portStr = window.location.port;

    const dataEl = document.getElementById("mcp-data");
    const workspaceId = dataEl ? dataEl.getAttribute("data-workspace-id") : "global";

    const loader = document.getElementById("loader") as HTMLElement | null;
    const statusText = document.querySelector("p") as HTMLElement | null;
    const card = document.getElementById("main-card") as HTMLElement | null;

    if (!token || !target || !portStr) {
      if (statusText) {
        statusText.innerText = i18n.invalidLinkParameters;
        statusText.style.color = "#ff6b6b";
      }
      return;
    }

    const port = parseInt(portStr);
    let targetOrigin: string | undefined;
    try {
      targetOrigin = new URL(target).origin;
    } catch {
      targetOrigin = undefined;
    }

    function attemptHandshake(force = false) {
      // 发送握手请求给 Background
      chrome.runtime.sendMessage(
        {
          type: "HANDSHAKE",
          port: port,
          token: token,
          targetOrigin: targetOrigin || undefined,
          workspaceId: workspaceId,
          force: force,
        },
        (response: HandshakeResponse) => {
          if (chrome.runtime.lastError) {
            console.error("[WebMCP] Runtime error during handshake:", chrome.runtime.lastError);
            if (statusText && loader) {
                document.body.dataset.bridgeState = "error";
                statusText.innerHTML = `
                            <span style="color:#ff6b6b">${i18n.extensionNotDetectedTitle}</span><br>
                            <span style="font-size:0.8em; opacity:0.8">${i18n.extensionNotDetectedDesc}</span>
                        `;
                loader.style.display = "none";
            }
            return;
          }

          if (!statusText || !loader || !card) {return;}

          if (response && response.success) {
            document.body.dataset.bridgeState = "connected";
            statusText.innerText = i18n.connectedRedirecting;
            statusText.style.color = "#4CAF50";
            setTimeout(() => {
              window.location.href = target as string;
            }, 500);
          } else if (response && response.error === "BUSY") {
            // === 冲突处理 UI ===
            document.body.dataset.bridgeState = "conflict";
            loader.style.display = "none";
            statusText.innerHTML = `
                        <span style="color:#f39c12; font-weight:bold">${i18n.connectionConflictTitle}</span><br><br>
                        ${i18n.connectionConflictBody(port)}
                    `;

            const oldBtn = card.querySelector("button");
            if (oldBtn) {oldBtn.remove();}

            const btn = document.createElement("button");
            btn.innerText = i18n.connectHere;
            btn.style.marginTop = "20px";
            btn.onclick = () => {
              document.body.dataset.bridgeState = "switching";
              statusText.innerText = i18n.switchingConnection;
              loader.style.display = "block";
              btn.remove();
              attemptHandshake(true);
            };
            card.appendChild(btn);
          } else {
            document.body.dataset.bridgeState = "error";
            statusText.innerText = i18n.connectionFailed(
              response?.error || i18n.unknownError
            );
            statusText.style.color = "#ff6b6b";
          }
        }
      );
    }

    // 启动握手
    attemptHandshake();
  }

  // 核心修复：更鲁棒的 DOM 加载检测
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startHandshake);
  } else {
    startHandshake();
  }
})();
