import { type ToolExecutionPayload } from "../types";
import {
  getCommandExecutable,
  getCommandPrefix,
  isBroadCommandExecutable,
  normalizeCommandValue,
  type CommandApprovalScope,
} from "./command_approval";
import { isElementVisible } from "./dom_helpers";
import { t } from "./i18n";
import {
  clearUserAttention,
  showUserAttentionNotification,
} from "./user_attention";

const MODAL_EVENT_GUARD_TYPES = [
  "beforeinput",
  "change",
  "click",
  "compositionend",
  "compositionstart",
  "compositionupdate",
  "contextmenu",
  "cut",
  "dblclick",
  "input",
  "keydown",
  "keypress",
  "keyup",
  "mousedown",
  "mouseup",
  "paste",
  "pointerdown",
  "pointerup",
  "touchend",
  "touchstart",
];
const MODAL_FOCUS_RESTORE_TYPES = [
  "beforeinput",
  "compositionstart",
  "compositionupdate",
  "keydown",
  "keypress",
  "paste",
];

function installModalEventGuards(
  host: HTMLElement,
  shadow: ShadowRoot,
  getFocusTarget?: (event: Event) => HTMLElement | null
) {
  const cleanupCallbacks: Array<() => void> = [];
  const addGuard = (
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean
  ) => {
    target.addEventListener(type, listener, options);
    cleanupCallbacks.push(() => target.removeEventListener(type, listener, options));
  };

  const restoreModalFocus = (event: Event) => {
    const focusTarget = getFocusTarget?.(event);
    if (!focusTarget || !isElementVisible(focusTarget)) {return;}
    if (shadow.activeElement === focusTarget) {return;}
    focusTarget.focus({ preventScroll: true });
  };

  const stopPagePropagation = (event: Event) => {
    event.stopPropagation();
  };

  for (const type of MODAL_FOCUS_RESTORE_TYPES) {
    addGuard(host, type, restoreModalFocus, true);
  }

  for (const type of MODAL_EVENT_GUARD_TYPES) {
    addGuard(shadow, type, stopPagePropagation);
  }

  return () => {
    cleanupCallbacks.forEach((cleanup) => cleanup());
  };
}

function showApprovalWindowAttention(payload: ToolExecutionPayload): void {
  void showUserAttentionNotification({
    title: t("hitl_title"),
    message: `${t("hitl_intercept")}: ${payload.name}`,
    onlyWhenWindowInBackground: true,
  });
}

// === HITL 弹窗 (Shadow DOM) ===
/**
 * 生成并显示供人类操作员决定是否通过（Approval / Rejection）危险操作的安全授权遮罩弹窗（Human-In-The-Loop 机制）
 * @param payload 将要执行的工具的参数 (`ToolExecutionPayload` 对象，如 name, arguments, purpose)
 * @param onConfirm 用户同意执行所选定授权范围后的回调函数，范围有 `exact`（精确匹配），`executable`（命令主程序）等，如果是只通过一次则是 `false`。
 * @param onReject 用户明确拒绝时的回调函数，带有驳回原因(字符串)。
 * @description
 * - 该弹窗被隔离封装在网页内的 `Shadow DOM`，完全脱离并免疫网页原有任何样式的干扰与污染。
 * - 该弹窗不仅可以展示调用风险详情，也提供了为该工作空间永久放行特定类型操作的逻辑面板（一键通过，不再反复弹窗）。
 */
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
    outline: "none",
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
          .approval-option.warning { border-color: #f59e0b; background: #fff7ed; }
          .approval-option.disabled { border-color: #fca5a5; background: #fff1f2; }
          .approval-option strong { display: block; color: #1f2937; margin-bottom: 4px; }
          .approval-option code { display: block; margin-top: 6px; padding: 8px; border-radius: 6px; background: #eef2f7; color: #1d4ed8; word-break: break-all; }
          .approval-option button { margin-top: 10px; width: 100%; }
          .scope-warning { color: #b45309; font-size: 12px; font-weight: 600; margin-top: 8px; }
          button:disabled { cursor: not-allowed; opacity: 0.65; transform: none; box-shadow: none; }
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

  const safeArgs = escapeHtml(JSON.stringify(payload.arguments ?? {}, null, 2));
  const safeName = escapeHtml(payload.name);
  const safePurpose = escapeHtml((payload as any).purpose ?? "No purpose provided.");
  const commandValue = normalizeCommandValue(payload.arguments?.command) ?? "";
  const isCommandScopedApproval = (payload.name === "execute_command" || payload.name === "run_in_terminal") && Boolean(commandValue);
  const safeAlwaysTarget = escapeHtml(isCommandScopedApproval ? commandValue : payload.name);
  const alwaysTitle = isCommandScopedApproval
    ? t("cmd_always_title")
    : t("always_title");
  const alwaysDescription = isCommandScopedApproval
    ? t("cmd_always_desc")
    : t("always_desc_2");
  const exactKey = isCommandScopedApproval ? escapeHtml(`command-exact:${payload.name}:${commandValue}`) : "";
  const executableValue = isCommandScopedApproval ? getCommandExecutable(commandValue) ?? "" : "";
  const isBroadExecutable = Boolean(executableValue && isBroadCommandExecutable(executableValue));
  const executableKey = executableValue && !isBroadExecutable
    ? escapeHtml(`command-executable:${payload.name}:${executableValue}`)
    : "";
  const prefixValue = isCommandScopedApproval ? getCommandPrefix(commandValue) ?? "" : "";
  const prefixKey = prefixValue ? escapeHtml(`command-prefix:${payload.name}:${prefixValue}`) : "";
  const executableOptionHtml = executableValue
    ? renderExecutableApprovalOption(executableKey, isBroadExecutable)
    : "";
  const prefixOptionHtml = prefixValue
    ? renderPrefixApprovalOption(prefixKey, isBroadExecutable)
    : "";
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
              ${prefixOptionHtml}
              ${executableOptionHtml}
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
  const btnAllowExact = card.querySelector<HTMLButtonElement>(".btn-allow-exact");
  const btnAllowExecutable = card.querySelector<HTMLButtonElement>(".btn-allow-executable");
  const btnAllowPrefix = card.querySelector<HTMLButtonElement>(".btn-allow-prefix");
  const removeModalGuards = installModalEventGuards(host, shadow, (event) => {
    if (inputReason.style.display === "none") {return null;}
    const path = event.composedPath();
    if (path.includes(inputReason) || shadow.activeElement === inputReason) {
      return inputReason;
    }
    return null;
  });
  let isClosed = false;
  const closeModal = () => {
    if (isClosed) {return;}
    isClosed = true;
    clearUserAttention();
    removeModalGuards();
    host.remove();
  };

  // 1. Approve Once
  btnConfirm.onclick = () => {
    closeModal();
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
      closeModal();
      onConfirm('exact');
  };

  if (btnAllowExact) {
    btnAllowExact.onclick = () => {
      closeModal();
      onConfirm('exact');
    };
  }

  if (btnAllowExecutable && executableKey) {
    btnAllowExecutable.onclick = () => {
      closeModal();
      onConfirm('executable');
    };
  }

  if (btnAllowPrefix && prefixKey) {
    btnAllowPrefix.onclick = () => {
      closeModal();
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
      closeModal();
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
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      btnReject.click();
    }
  };
  overlay.appendChild(card);
  shadow.appendChild(overlay);
  showApprovalWindowAttention(payload);
}

function renderExecutableApprovalOption(executableKey: string, isBroadExecutable: boolean): string {
  if (isBroadExecutable) {
    return `
              <div class="approval-option disabled">
                  <strong>${t("cmd_scope_executable_title")}</strong>
                  <div>${t("cmd_scope_executable_desc")}</div>
                  <div class="scope-warning">${t("cmd_scope_executable_blocked")}</div>
                  <button class="btn-allow-executable btn-scope-approve" disabled>${t("btn_allow_executable")}</button>
              </div>
          `;
  }

  return `
              <div class="approval-option">
                  <strong>${t("cmd_scope_executable_title")}</strong>
                  <div>${t("cmd_scope_executable_desc")}</div>
                  <div class="label">${t("label_rule_key")}</div>
                  <code>${executableKey}</code>
                  <button class="btn-allow-executable btn-scope-approve">${t("btn_allow_executable")}</button>
              </div>
          `;
}

function renderPrefixApprovalOption(prefixKey: string, isBroadExecutable: boolean): string {
  const warning = isBroadExecutable
    ? `<div class="scope-warning">${t("cmd_scope_prefix_warning")}</div>`
    : "";

  return `
              <div class="approval-option${isBroadExecutable ? " warning" : ""}">
                  <strong>${t("cmd_scope_prefix_title")}</strong>
                  <div>${t("cmd_scope_prefix_desc")}</div>
                  ${warning}
                  <div class="label">${t("label_rule_key")}</div>
                  <code>${prefixKey}</code>
                  <button class="btn-allow-prefix btn-scope-approve">${t("btn_allow_prefix")}</button>
              </div>
          `;
}
