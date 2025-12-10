(function () {
  "use strict";
  window.WebMCP = window.WebMCP || {};
  WebMCP.UI = {};

  let autoSendTimer = null;

  // === 视觉标记 ===
  WebMCP.UI.markVisualSuccess = function (element) {
    element.dataset.mcpVisual = "true";
    element.style.border = "2px solid #00E676";
    element.style.borderRadius = "4px";
  };

  // === 回填输入框 ===
  WebMCP.UI.writeToInputBox = function (text, inputSelector) {
    const inputEl = document.querySelector(inputSelector);
    if (!inputEl) {
      WebMCP.Logger.log(WebMCP.t("input_not_found"), "error");
      return;
    }

    let cur = inputEl.innerText || inputEl.value || "";
    cur = cur.replace(/\r\n/g, "\n").replace(/\n+/g, "\n").trim();
    const sep = cur ? "\n\n" : "";
    const final = cur + sep + text;

    inputEl.focus();
    let success = false;
    try {
      document.execCommand("selectAll", false, null);
      success = document.execCommand("insertText", false, final);
    } catch (e) {}

    if (!success) {
      if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT")
        inputEl.value = final;
      else inputEl.innerText = final;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    WebMCP.Logger.log(WebMCP.t("result_written"), "action");
  };

  // === 自动发送逻辑 ===
  WebMCP.UI.triggerAutoSend = function (CONFIG, DOM) {
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
      if (inputEl) inputEl.focus(); // Focus Fix

      const currentVal = inputEl
        ? inputEl.value || inputEl.innerText || ""
        : "";
      if (currentVal.trim().length === 0) {
        WebMCP.Logger.log(WebMCP.t("send_success_cleared"), "success");
        return;
      }

      if (inputEl) {
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (btn && !btn.disabled) {
        btn.focus();
        btn.click();
        WebMCP.Logger.log(
          `${WebMCP.t("auto_send_attempt")} (${retryCount + 1})`,
          "action"
        );
      } else if (!btn) {
        WebMCP.Logger.log(WebMCP.t("send_btn_missing"), "warn");
      } else {
        WebMCP.Logger.log(WebMCP.t("send_btn_disabled"), "warn");
      }

      retryCount++;
      if (retryCount < maxRetries) {
        autoSendTimer = setTimeout(trySend, 2000);
      } else {
        WebMCP.Logger.log(WebMCP.t("auto_send_timeout"), "error");
        chrome.runtime.sendMessage({
          type: "SHOW_NOTIFICATION",
          title: "Auto-Send Failed",
          message: "Could not click send button.",
        });
      }
    };
    autoSendTimer = setTimeout(trySend, 1000);
  };

  // === HITL 弹窗 (Shadow DOM) ===
  WebMCP.UI.showConfirmationModal = function (payload, onConfirm, onReject) {
    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed",
      zIndex: 999999,
      top: 0,
      left: 0,
      width: "0",
      height: "0",
    });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
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

    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
            <h2><span class="warn-icon">✋</span> Approval Required</h2>
            <div class="field"><span class="label">Tool Name</span><div class="value" style="font-weight:bold; color:#d32f2f">${
              payload.name
            }</div></div>
            <div class="field"><span class="label">Arguments</span><div class="value">${JSON.stringify(
              payload.arguments || {},
              null,
              2
            )}</div></div>
            <input type="text" class="reason" placeholder="Reason for rejection (Optional)...">
            <div class="buttons">
                <button class="btn-back">Back</button>
                <button class="btn-reject">Reject</button>
                <button class="btn-confirm">Approve & Execute</button>
            </div>
        `;

    const btnBack = card.querySelector(".btn-back");
    const btnReject = card.querySelector(".btn-reject");
    const btnConfirm = card.querySelector(".btn-confirm");
    const inputReason = card.querySelector(".reason");

    btnConfirm.onclick = () => {
      document.body.removeChild(host);
      onConfirm();
    };

    let rejectStep = 0;
    btnReject.onclick = () => {
      if (rejectStep === 0) {
        rejectStep = 1;
        inputReason.style.display = "block";
        inputReason.focus();
        btnReject.textContent = "Confirm Rejection";
        btnConfirm.style.display = "none";
        btnBack.style.display = "inline-block";
      } else {
        const reason = inputReason.value.trim();
        document.body.removeChild(host);
        onReject(reason);
      }
    };

    btnBack.onclick = () => {
      rejectStep = 0;
      inputReason.style.display = "none";
      inputReason.value = "";
      btnReject.textContent = "Reject";
      btnConfirm.style.display = "inline-block";
      btnBack.style.display = "none";
    };

    inputReason.onkeydown = (e) => {
      if (e.key === "Enter") btnReject.click();
    };
    overlay.appendChild(card);
    shadow.appendChild(overlay);
  };
})();
