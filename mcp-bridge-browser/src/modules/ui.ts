import { Logger, t } from './utils';
import { ToolExecutionPayload } from '../types';
import { SiteSelectors } from './config';

let autoSendTimer: NodeJS.Timeout | null = null;
export type CommandApprovalScope = false | 'exact' | 'executable' | 'prefix';

export function cancelAutoSend() {
  if (autoSendTimer) {
    clearTimeout(autoSendTimer);
    autoSendTimer = null;
    Logger.log("🚫 Auto-send cancelled (New activity detected)", "warn");
  }
}

// === 视觉标记 ===

// 状态 1: 处理中 (蓝色)
export function markVisualProcessing(element: HTMLElement) {
  if (element.dataset.mcpState === "processing") {return;}
  element.dataset.mcpState = "processing";
  element.dataset.mcpVisual = "true";
  element.style.border = "2px solid #2196F3"; // Blue
  element.style.borderRadius = "4px";
  element.style.transition = "border-color 0.3s ease";
}

// 状态 2: 成功 (绿色)
export function markVisualSuccess(element: HTMLElement) {
  if (element.dataset.mcpState === "success") {return;}
  element.dataset.mcpState = "success";
  element.dataset.mcpVisual = "true";
  element.style.border = "2px solid #00E676"; // Green
  element.style.borderRadius = "4px";
}

// 状态 3: 错误 (红色)
export function markVisualError(element: HTMLElement) {
  if (element.dataset.mcpState === "error") {return;}
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
  } catch {
  }

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

export async function deliverResult(text: string, domSelectors: SiteSelectors): Promise<{ uploaded: boolean }> {
  const maxInlineChars = typeof domSelectors.maxInlineChars === "number"
    ? domSelectors.maxInlineChars
    : 0;

  if (!maxInlineChars || text.length <= maxInlineChars) {
    writeToInputBox(text, domSelectors.inputArea);
    return { uploaded: false };
  }

  const attachmentMode = domSelectors.attachmentMode || "pasteFile";
  const uploaded = attachmentMode === "fileInput"
    ? await uploadTextAsAttachment(text, domSelectors)
    : await pasteTextAsAttachment(text, domSelectors);

  if (!uploaded) {
    Logger.log("Attachment upload failed. Falling back to inline result.", "warn");
    writeToInputBox(text, domSelectors.inputArea);
    return { uploaded: false };
  }

  Logger.log(`Attached oversized result as TXT (${text.length} chars)`, "action");
  return { uploaded: true };
}

// === 自动发送逻辑 ===
export function triggerAutoSend(
  config: { autoSend: boolean },
  domSelectors: SiteSelectors,
  options: { allowEmptyInput?: boolean } = {}
) {
  if (!config.autoSend) {return;}
  if (autoSendTimer) {
    clearTimeout(autoSendTimer);
    autoSendTimer = null;
  }

  let retryCount = 0;
  const maxRetries = 5;

  const trySend = () => {
    const btn = document.querySelector(domSelectors.sendButton) as HTMLButtonElement;
    const inputEl = document.querySelector(domSelectors.inputArea) as HTMLElement;
    if (inputEl) {inputEl.focus();}

    const currentVal = inputEl
      ? (inputEl as any).value || inputEl.innerText || ""
      : "";
      
    if (currentVal.trim().length === 0 && !options.allowEmptyInput) {
      Logger.log(t("send_success_cleared"), "success");
      return;
    }

    if (inputEl) {
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    let triggered = false;
    if (isSendButtonReady(btn)) {
      triggered = triggerButtonSend(btn);
      if (triggered) {
        Logger.log(
          `${t("auto_send_attempt")} (${retryCount + 1})`,
          "action"
        );
      }
    } else if (!btn) {
      Logger.log(t("send_btn_missing"), "warn");
    } else {
      Logger.log(t("send_btn_disabled"), "warn");
    }

    if (!triggered && inputEl) {
      triggerCtrlEnterSend(inputEl);
      Logger.log(`Auto-send fallback: Ctrl+Enter (${retryCount + 1})`, "action");
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

async function uploadTextAsAttachment(text: string, domSelectors: SiteSelectors): Promise<boolean> {
  let fileInput = queryFileInput(domSelectors.fileInput);

  if (!fileInput && domSelectors.attachButton) {
    const attachButton = document.querySelector(domSelectors.attachButton) as HTMLElement | null;
    if (attachButton) {
      triggerButtonSend(attachButton);
      await delay(300);
      fileInput = queryFileInput(domSelectors.fileInput);
    }
  }

  if (!fileInput) {return false;}

  const filename = `webmcp-result-${Date.now()}.txt`;
  const file = new File([text], filename, { type: "text/plain" });
  const transfer = new DataTransfer();
  transfer.items.add(file);

  try {
    fileInput.files = transfer.files;
  } catch {
    return false;
  }

  fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));

  if (domSelectors.attachmentReadyIndicator) {
    return waitForAttachmentReady(domSelectors.attachmentReadyIndicator, 8000);
  }

  await delay(800);
  return true;
}

async function pasteTextAsAttachment(text: string, domSelectors: SiteSelectors): Promise<boolean> {
  const inputEl = document.querySelector(domSelectors.inputArea) as HTMLElement | null;
  if (!inputEl) {return false;}

  const filename = `webmcp-result-${Date.now()}.txt`;
  const file = new File([text], filename, { type: "text/plain" });
  const clipboardData = new DataTransfer();
  clipboardData.items.add(file);

  inputEl.focus();
  const pasteEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData,
  });
  inputEl.dispatchEvent(pasteEvent);

  if (domSelectors.attachmentReadyIndicator) {
    return waitForAttachmentReady(domSelectors.attachmentReadyIndicator, 8000);
  }

  await delay(800);
  return true;
}

function queryFileInput(selector?: string): HTMLInputElement | null {
  if (selector) {
    return document.querySelector(selector) as HTMLInputElement | null;
  }

  return document.querySelector('input[type="file"]') as HTMLInputElement | null;
}

async function waitForAttachmentReady(selector: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el && isElementVisible(el)) {return true;}
    await delay(200);
  }
  return false;
}

function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return false;
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSendButtonReady(btn: HTMLButtonElement | null): btn is HTMLButtonElement {
  if (!btn) {return false;}
  if (btn.disabled) {return false;}
  if (btn.getAttribute("aria-disabled") === "true") {return false;}

  return isElementVisible(btn);
}

function triggerButtonSend(btn: HTMLElement): boolean {
  btn.focus();
  const mouseEventTypes: Array<"pointerdown" | "mousedown" | "pointerup" | "mouseup" | "click"> = [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ];

  for (const type of mouseEventTypes) {
    btn.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
  }

  btn.click();
  return true;
}

function triggerCtrlEnterSend(inputEl: HTMLElement) {
  inputEl.focus();
  const keyboardEventInit: KeyboardEventInit = {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
  };

  inputEl.dispatchEvent(new KeyboardEvent("keydown", keyboardEventInit));
  inputEl.dispatchEvent(new KeyboardEvent("keypress", keyboardEventInit));
  inputEl.dispatchEvent(new KeyboardEvent("keyup", keyboardEventInit));
}

// === HITL 弹窗 (Shadow DOM) ===
export function showConfirmationModal(
  payload: ToolExecutionPayload,
  onConfirm: (scope: CommandApprovalScope) => void,
  onReject: (reason: string) => void
) {
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
          :host { all: initial; color-scheme: light; }
          *, *::before, *::after { box-sizing: border-box; }
          .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; padding: 24px; overflow-y: auto; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          .card { background: #fff; padding: 24px; border-radius: 12px; width: 450px; max-width: min(90vw, 450px); max-height: calc(100vh - 48px); overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.4); border: 1px solid #e0e0e0; color: #333; animation: fadeIn 0.2s ease-out; box-sizing: border-box; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          h2 { margin: 0 0 16px 0; color: #d32f2f; display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 600; }
          .warn-icon { font-size: 24px; }
          .field { margin-bottom: 16px; }
          .label { font-weight: 600; font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block; }
          .value { background: #f8f9fa; padding: 10px; border-radius: 6px; font-family: "Menlo", "Consolas", monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all; max-height: 250px; overflow-y: auto; border: 1px solid #e9ecef; color: #212529; }
          .buttons { display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end; align-items: center; }
          button, input { font: inherit; }
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
          .approval-options { display: grid; gap: 10px; margin-top: 14px; text-align: left; }
          .approval-option { border: 1px solid #d7dce2; border-radius: 8px; padding: 12px; background: #f8f9fa; }
          .approval-option strong { display: block; color: #1f2937; margin-bottom: 4px; }
          .approval-option code { display: block; margin-top: 6px; padding: 8px; border-radius: 6px; background: #eef2f7; color: #1d4ed8; word-break: break-all; }
          .approval-option button { margin-top: 10px; width: 100%; }
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
  const commandValue = typeof payload.arguments?.command === "string"
    ? payload.arguments.command.trim().replace(/\s+/g, " ")
    : "";
  const isCommandScopedApproval = (payload.name === "execute_command" || payload.name === "run_in_terminal") && !!commandValue;
  const safeAlwaysTarget = escapeHtml(isCommandScopedApproval ? commandValue : payload.name);
  const alwaysTitle = isCommandScopedApproval
    ? t("cmd_always_title")
    : t("always_title");
  const alwaysDescription = isCommandScopedApproval
    ? t("cmd_always_desc")
    : t("always_desc_2");
  const exactKey = isCommandScopedApproval ? escapeHtml(`command-exact:${payload.name}:${commandValue}`) : "";
  const executableValue = isCommandScopedApproval ? getCommandExecutable(commandValue) : "";
  const executableKey = executableValue ? escapeHtml(`command-executable:${payload.name}:${executableValue}`) : "";
  const prefixValue = isCommandScopedApproval ? getCommandPrefix(commandValue) : "";
  const prefixKey = prefixValue ? escapeHtml(`command-prefix:${payload.name}:${prefixValue}`) : "";
  const alwaysOptionsHtml = isCommandScopedApproval
    ? `
          <div class="approval-options">
              <div class="approval-option">
                  <strong>${t("cmd_scope_exact_title")}</strong>
                  <div>${t("cmd_scope_exact_desc")}</div>
                  <div class="label">${t("label_rule_key")}</div>
                  <code>${exactKey}</code>
                  <button class="btn-allow-exact btn-scope-approve">${t("btn_allow_exact")}</button>
              </div>
              <div class="approval-option">
                  <strong>${t("cmd_scope_executable_title")}</strong>
                  <div>${t("cmd_scope_executable_desc")}</div>
                  <div class="label">${t("label_rule_key")}</div>
                  <code>${executableKey}</code>
                  <button class="btn-allow-executable btn-scope-approve">${t("btn_allow_executable")}</button>
              </div>
              <div class="approval-option">
                  <strong>${t("cmd_scope_prefix_title")}</strong>
                  <div>${t("cmd_scope_prefix_desc")}</div>
                  <div class="label">${t("label_rule_key")}</div>
                  <code>${prefixKey}</code>
                  <button class="btn-allow-prefix btn-scope-approve">${t("btn_allow_prefix")}</button>
              </div>
          </div>
      `
    : "";

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
               <p style="color:#d32f2f; font-weight:bold; font-size: 16px; margin: 0 0 10px 0;">${alwaysTitle}</p>
               <p style="color:#666; font-size: 13px; line-height: 1.5; margin: 0;">
                  ${t("always_desc_1")} <b>${safeAlwaysTarget}</b>.<br>
                  ${alwaysDescription}
               </p>
               ${alwaysOptionsHtml}
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
  const btnAllowExact = card.querySelector(".btn-allow-exact") as HTMLButtonElement | null;
  const btnAllowExecutable = card.querySelector(".btn-allow-executable") as HTMLButtonElement | null;
  const btnAllowPrefix = card.querySelector(".btn-allow-prefix") as HTMLButtonElement | null;

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
      btnConfirmAlways.style.display = isCommandScopedApproval ? "none" : "inline-block";
  };

  // 2.1 Always Allow Confirm Action
  btnConfirmAlways.onclick = () => {
      document.body.removeChild(host);
      onConfirm('exact');
  };

  if (btnAllowExact) {
    btnAllowExact.onclick = () => {
      document.body.removeChild(host);
      onConfirm('exact');
    };
  }

  if (btnAllowExecutable) {
    btnAllowExecutable.onclick = () => {
      document.body.removeChild(host);
      onConfirm('executable');
    };
  }

  if (btnAllowPrefix) {
    btnAllowPrefix.onclick = () => {
      document.body.removeChild(host);
      onConfirm('prefix');
    };
  }

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
      btnConfirmAlways.style.display = "none";
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
    if (e.key === "Enter") {btnReject.click();}
  };
  overlay.appendChild(card);
  shadow.appendChild(overlay);
}

function getCommandExecutable(command: string): string {
  const tokens = tokenizeCommandLine(command);
  return tokens[0] || command;
}

function getCommandPrefix(command: string): string {
  const tokens = tokenizeCommandLine(command);
  if (tokens.length <= 1) {
    return command;
  }

  return tokens.slice(0, 2).join(" ");
}

function tokenizeCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}
