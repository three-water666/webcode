(function () {
  // === 核心修复：等待 DOM 加载完成 ===
  // 标记插件已安装，供页面检测
  document.documentElement.setAttribute("data-extension-installed", "true");

  window.addEventListener("DOMContentLoaded", () => {
    console.log("[WebMCP] Bridge DOM Loaded, starting handshake...");

    // 1. 从 URL 获取参数
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const target = params.get("target");
    const portStr = window.location.port;

    const loader = document.getElementById("loader");
    const statusText = document.querySelector("p");
    const card = document.getElementById("main-card");

    if (!token || !target || !portStr) {
      if (statusText) {
        statusText.innerText = "Invalid Link Parameters";
        statusText.style.color = "#ff6b6b";
      }
      return;
    }

    const port = parseInt(portStr);

    function attemptHandshake(force = false) {
      // 发送握手请求给 Background
      chrome.runtime.sendMessage(
        {
          type: "HANDSHAKE",
          port: port,
          token: token,
          force: force,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            statusText.innerHTML = `
                        <span style="color:#ff6b6b">❌ Extension Not Detected</span><br>
                        <span style="font-size:0.8em; opacity:0.8">Please ensure 'WebMCP Bridge' extension is installed and enabled.</span>
                    `;
            loader.style.display = "none";
            return;
          }

          if (response && response.success) {
            statusText.innerText = "✅ Connected! Redirecting...";
            statusText.style.color = "#4CAF50";
            setTimeout(() => {
              window.location.href = target;
            }, 500);
          } else if (response && response.error === "BUSY") {
            // === 冲突处理 UI ===
            loader.style.display = "none";
            statusText.innerHTML = `
                        <span style="color:#f39c12; font-weight:bold">⚠️ Connection Conflict</span><br><br>
                        VS Code (Port ${port}) is already connected to another tab.<br>
                        Do you want to switch the connection here?
                    `;

            const oldBtn = card.querySelector("button");
            if (oldBtn) oldBtn.remove();

            const btn = document.createElement("button");
            btn.innerText = "Yes, Connect Here";
            btn.style.marginTop = "20px";
            btn.onclick = () => {
              statusText.innerText = "Switching connection...";
              loader.style.display = "block";
              btn.remove();
              attemptHandshake(true);
            };
            card.appendChild(btn);
          } else {
            statusText.innerText = `Connection Failed: ${
              response ? response.error : "Unknown Error"
            }`;
            statusText.style.color = "#ff6b6b";
          }
        }
      );
    }

    // 启动握手
    attemptHandshake();
  });
})();
