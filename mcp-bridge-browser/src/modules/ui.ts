import { Logger, t } from './utils';
import { ToolExecutionPayload } from '../types';
import { SiteSelectors } from './config';

let autoSendTimer: NodeJS.Timeout | null = null;

// === 视觉标记 ===

// 状态 1: 处理中 (蓝色)
export function markVisualProcessing(element: HTMLElement) {
  if (element.dataset.mcpState === "processing") return;
  element.dataset.mcpState = "processing";
  element.dataset.mcpVisual = "true";
  element.style.border = "2px solid #2196F3"; // Blue
  element.style.borderRadius = "4px";
  element.style.transition = "border-color 0.3s ease";
}

// 状态 2: 成功 (绿色)
export function markVisualSuccess(element: HTMLElement) {
  if (element.dataset.mcpState === "success") return;
  element.dataset.mcpState = "success";
  element.dataset.mcpVisual = "true";
  element.style.border = "2px solid #00E676"; // Green
  element.style.borderRadius = "4px";
}

// 状态 3: 错误 (红色)
export function markVisualError(element: HTMLElement) {
  if (element.dataset.mcpState === "error") return;
  element.dataset.mcpState = "error";
  element.dataset.mcpVisual = "true";
  element.style.border = "2px solid #F44336"; // Red
  element.style.borderRadius = "4px";
}

// === 回填输入框 ===
export function writeToInputBox(text: string, inputSelector: string) {
  const inputEl = document.querySelector(inputSelector) as HTMLElement | HTMLInputElement | HTMLTextAreaElement;
  if (!inputEl) {
    Logger.log(t("input_not_found"), "error");
    return;
  }

  let cur = inputEl.innerText || (inputEl as any).value || "";
  cur = cur.replace(/\r\n/g, "\n").replace(/\n+/g, "\n").trim();
  const sep = cur ? "\n\n" : "";
  const final = cur + sep + text;

  inputEl.focus();
  let success = false;
  try {
    document.execCommand("selectAll", false);
    success = document.execCommand("insertText", false, final);
  } catch (e) {}

  if (!success) {
    if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
        (inputEl as HTMLInputElement).value = final;
    } else {
        inputEl.innerText = final;
    }
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }
  Logger.log(t("result_written"), "action");
}

// === 自动发送逻辑 ===
export function triggerAutoSend(config: { autoSend: boolean }, domSelectors: SiteSelectors) {
  if (!config.autoSend) return;
  if (autoSendTimer) {
    clearTimeout(autoSendTimer);
    autoSendTimer = null;
  }

  let retryCount = 0;
  const maxRetries = 5;

  const trySend = () => {
    const btn = document.querySelector(domSelectors.sendButton) as HTMLButtonElement;
    const inputEl = document.querySelector(domSelectors.inputArea) as HTMLElement;
    if (inputEl) inputEl.focus();

    const currentVal = inputEl
      ? (inputEl as any).value || inputEl.innerText || ""
      : "";
      
    if (currentVal.trim().length === 0) {
      Logger.log(t("send_success_cleared"), "success");
      return;
    }

    if (inputEl) {
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (btn && !btn.disabled) {
      btn.focus();
      btn.click();
      Logger.log(
        `${t("auto_send_attempt")} (${retryCount + 1})`,
        "action"
      );
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
      chrome.runtime.sendMessage({
        type: "SHOW_NOTIFICATION",
        title: "Auto-Send Failed",
        message: "Could not click send button.",
      });
    }
  };
  autoSendTimer = setTimeout(trySend, 1000);
}

// === HITL 弹窗 (Shadow DOM) ===
export function showConfirmationModal(payload: ToolExecutionPayload, onConfirm: (always: boolean) => void, onReject: (reason: string) => void) {
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
          .btn-always { background: #ff9800; color: white; margin-right: auto; }
          .btn-always:hover { background: #f57c00; }
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

  const escapeHtml = (unsafe: string) => {
      return (unsafe || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
  };

  const safeArgs = escapeHtml(JSON.stringify(payload.arguments || {}, null, 2));
  const safeName = escapeHtml(payload.name);
  const safePurpose = escapeHtml((payload as any).purpose || "No purpose provided.");

  card.innerHTML = `
          <h2><span class="warn-icon">✋</span> ${t("hitl_title")}</h2>
          
          <div id="view-main">
              <div class="field">
                  <span class="label">${t("label_tool")}</span>
                  <div class="value" style="font-weight:bold; color:#d32f2f">${safeName}</div>
              </div>
              <div class="field">
                  <span class="label">${t("label_purpose")}</span>
                  <div class="value" style="color:#1976d2; font-weight:500">${safePurpose}</div>
              </div>
              <div class="field">
                  <span class="label">${t("label_args")}</span>
                  <div class="value">${safeArgs}</div>
              </div>
          </div>

          <div id="view-always-confirm" style="display:none; padding: 15px 0; text-align: center;">
               <div style="font-size: 40px; margin-bottom: 10px;">🔓</div>
               <p style="color:#d32f2f; font-weight:bold; font-size: 16px; margin: 0 0 10px 0;">${t("always_title")}</p>
               <p style="color:#666; font-size: 13px; line-height: 1.5; margin: 0;">
                  ${t("always_desc_1")} <b>${safeName}</b>.<br>
                  ${t("always_desc_2")}
               </p>
          </div>

          <input type="text" class="reason" placeholder="${t("placeholder_reason")}">
          
          <div class="buttons">
              <button class="btn-always">${t("btn_always")}</button>
              <button class="btn-back">${t("btn_back")}</button>
              <button class="btn-reject">${t("btn_reject")}</button>
              <button class="btn-confirm">${t("btn_approve")}</button>
              <button class="btn-confirm-always" style="display:none; background:#ff9800; color:white;">${t("btn_allow_confirm")}</button>
          </div>
      `;

  const viewMain = card.querySelector("#view-main") as HTMLElement;
  const viewAlways = card.querySelector("#view-always-confirm") as HTMLElement;

  const btnAlways = card.querySelector(".btn-always") as HTMLButtonElement;
  const btnBack = card.querySelector(".btn-back") as HTMLButtonElement;
  const btnReject = card.querySelector(".btn-reject") as HTMLButtonElement;
  const btnConfirm = card.querySelector(".btn-confirm") as HTMLButtonElement;
  const btnConfirmAlways = card.querySelector(".btn-confirm-always") as HTMLButtonElement;
  const inputReason = card.querySelector(".reason") as HTMLInputElement;

  // 1. Approve Once
  btnConfirm.onclick = () => {
    document.body.removeChild(host);
    onConfirm(false);
  };

  // 2. Always Allow Flow (Switch View)
  btnAlways.onclick = () => {
      viewMain.style.display = "none";
      viewAlways.style.display = "block";
      
      btnAlways.style.display = "none";
      btnReject.style.display = "none";
      btnConfirm.style.display = "none";
      
      btnBack.style.display = "inline-block";
      btnConfirmAlways.style.display = "inline-block";
  };

  // 2.1 Always Allow Confirm Action
  btnConfirmAlways.onclick = () => {
      document.body.removeChild(host);
      onConfirm(true);
  };

  // 3. Reject Flow
  let rejectStep = 0;
  btnReject.onclick = () => {
    if (rejectStep === 0) {
      rejectStep = 1;
      inputReason.style.display = "block";
      inputReason.focus();
      btnReject.textContent = t("btn_reject_confirm");
      
      btnConfirm.style.display = "none";
      btnAlways.style.display = "none";
      btnBack.style.display = "inline-block";
    } else {
      const reason = inputReason.value.trim();
      document.body.removeChild(host);
      onReject(reason);
    }
  };

  // Back Handler (Reset all states)
  btnBack.onclick = () => {
    // Reset Reject
    rejectStep = 0;
    inputReason.style.display = "none";
    inputReason.value = "";
    btnReject.textContent = t("btn_reject");
    
    // Reset Views
    viewMain.style.display = "block";
    viewAlways.style.display = "none";
    
    // Reset Buttons
    btnConfirm.style.display = "inline-block";
    btnReject.style.display = "inline-block";
    btnAlways.style.display = "inline-block";
    
    btnBack.style.display = "none";
    btnConfirmAlways.style.display = "none";
  };

  inputReason.onkeydown = (e) => {
    if (e.key === "Enter") btnReject.click();
  };
  overlay.appendChild(card);
  shadow.appendChild(overlay);
}