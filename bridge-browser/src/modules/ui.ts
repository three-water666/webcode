import { Logger, t, i18n } from './utils';
import { type ToolExecutionPayload } from '../types';
import { type SiteSelectors } from './config';
import { BRANDING } from '@webcode/shared';

let autoSendTimer: NodeJS.Timeout | null = null;
export type CommandApprovalScope = false | 'exact' | 'executable' | 'prefix';
type VisualState = "processing" | "success" | "error";
type AutoSendAction = "ctrl-enter" | "enter" | "button";

const VISUAL_STATUS_STYLE_ID = `${BRANDING.slug}-mcp-visual-status-style`;
const AUTO_SEND_INITIAL_DELAY_MS = 350;
const AUTO_SEND_SETTLE_MS = 1200;
const AUTO_SEND_RETRY_MS = 1600;
const AUTO_SEND_ACTIONS: AutoSendAction[] = [
  "enter",
  "ctrl-enter",
  "button",
  "enter",
  "ctrl-enter",
];
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

/**
 * 终止当前正在进行的自动发送轮询机制
 * @description 如果定时器存在，清除它并输出取消日志。主要用于当监听到用户手动输入或页面有新活动时，打断之前的自动发送操作。
 */
export function cancelAutoSend() {
  if (autoSendTimer) {
    clearTimeout(autoSendTimer);
    autoSendTimer = null;
    Logger.log("🚫 Auto-send cancelled (New activity detected)", "warn");
  }
}

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

// === 视觉标记 ===

function ensureVisualStatusStyle() {
  if (document.getElementById(VISUAL_STATUS_STYLE_ID)) {return;}

  const style = document.createElement("style");
  style.id = VISUAL_STATUS_STYLE_ID;
  style.textContent = `
    [data-mcp-visual="true"] {
      position: relative !important;
      box-sizing: border-box !important;
    }
    [data-mcp-visual="true"]::after {
      content: attr(data-mcp-status-label);
      position: absolute;
      top: 6px;
      right: 8px;
      z-index: 10;
      padding: 2px 8px;
      border-radius: 999px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      font-weight: 700;
      line-height: 16px;
      letter-spacing: 0.02em;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
      white-space: nowrap;
    }
    [data-mcp-visual="true"][data-mcp-state="processing"]::before {
      content: "...";
      position: absolute;
      top: 8px;
      right: 12px;
      z-index: 11;
      width: 0;
      overflow: hidden;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      font-weight: 700;
      line-height: 16px;
      pointer-events: none;
      white-space: nowrap;
      animation: ${BRANDING.slug}-mcp-loading-dots 1.2s steps(4, end) infinite;
    }
    [data-mcp-visual="true"][data-mcp-state="processing"]::after {
      background: #1565C0;
      padding-right: 24px;
      animation: ${BRANDING.slug}-mcp-status-pulse 1.2s ease-in-out infinite;
    }
    [data-mcp-visual="true"][data-mcp-state="success"]::after {
      background: #008C45;
    }
    [data-mcp-visual="true"][data-mcp-state="error"]::after {
      background: #C62828;
    }
    @keyframes ${BRANDING.slug}-mcp-loading-dots {
      0% {
        width: 0;
      }
      25% {
        width: 0.35em;
      }
      50% {
        width: 0.7em;
      }
      75%,
      100% {
        width: 1.05em;
      }
    }
    @keyframes ${BRANDING.slug}-mcp-status-pulse {
      0%,
      100% {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
      }
      50% {
        box-shadow: 0 2px 12px rgba(21, 101, 192, 0.55);
      }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function markVisualState(
  element: HTMLElement,
  state: VisualState,
  labelKey: string,
  borderColor: string,
  shadowColor: string
) {
  const label = t(labelKey);
  const visualElement = getVisualElement(element);
  if (
    element.dataset.mcpState === state &&
    visualElement.dataset.mcpState === state &&
    visualElement.dataset.mcpStatusLabel === label
  ) {
    return;
  }

  ensureVisualStatusStyle();
  if (visualElement !== element && element.dataset.mcpVisual === "true") {
    clearVisualAttributes(element);
  }

  element.dataset.mcpState = state;
  element.dataset.mcpStatusLabel = label;

  if (visualElement !== element) {
    delete element.dataset.mcpVisual;
  }

  visualElement.style.border = `2px solid ${borderColor}`;
  visualElement.style.borderRadius = "6px";
  visualElement.style.transition = "border-color 0.3s ease, box-shadow 0.3s ease";
  visualElement.style.boxShadow = `0 0 0 3px ${shadowColor}`;
  visualElement.dataset.mcpState = state;
  visualElement.dataset.mcpVisual = "true";
  visualElement.dataset.mcpStatusLabel = label;
}

function getVisualElement(element: HTMLElement): HTMLElement {
  if (element.tagName.toLowerCase() === "code") {
    const pre = element.closest("pre");
    if (pre instanceof HTMLElement && shouldUsePreVisualElement(element, pre)) {
      return pre;
    }
  }

  return element;
}

function shouldUsePreVisualElement(element: HTMLElement, pre: HTMLElement): boolean {
  const display = window.getComputedStyle(element).display;
  if (display.includes("inline") || display === "contents") {
    return true;
  }

  const elementRect = element.getBoundingClientRect();
  const preRect = pre.getBoundingClientRect();
  if (elementRect.width <= 0 || preRect.width <= 0) {
    return false;
  }

  return elementRect.width + 24 < preRect.width;
}

function clearVisualAttributes(element: HTMLElement) {
  const hadVisualStyle = element.dataset.mcpVisual === "true";

  delete element.dataset.mcpState;
  delete element.dataset.mcpVisual;
  delete element.dataset.mcpStatusLabel;

  if (!hadVisualStyle) {return;}

  element.style.border = "";
  element.style.borderRadius = "";
  element.style.transition = "";
  element.style.boxShadow = "";
}

export function clearVisualState(element: HTMLElement) {
  const visualElement = getVisualElement(element);

  clearVisualAttributes(element);
  if (visualElement !== element) {
    clearVisualAttributes(visualElement);
  }
}

// 状态 1: 处理中 (蓝色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“处理中”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为蓝色，表示该 MCP 工具请求已被捕获并正在排队或执行中。
 */
export function markVisualProcessing(element: HTMLElement) {
  markVisualState(element, "processing", "visual_processing", "#2196F3", "rgba(33, 150, 243, 0.24)");
}

// 状态 2: 成功 (绿色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“执行成功”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为绿色，表示 MCP 工具已经执行完毕且结果已写回给大模型。
 */
export function markVisualSuccess(element: HTMLElement) {
  markVisualState(element, "success", "visual_success", "#00E676", "rgba(0, 230, 118, 0.22)");
}

// 状态 3: 错误 (红色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“执行失败/错误”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为红色，表示该工具调用在执行或 JSON 解析阶段发生错误，或被用户人工拒绝。
 */
export function markVisualError(element: HTMLElement) {
  markVisualState(element, "error", "visual_error", "#F44336", "rgba(244, 67, 54, 0.24)");
}

// === 回填输入框 ===
/**
 * 将工具执行的结果回填到网页内的主要输入框（聊天框）中
 * @param text 要回填的文本字符串
 * @param inputSelector 网页对应输入框的 DOM 选择器
 * @description
 * - 寻找目标输入区域，读取已有内容并按需附加空行进行拼接。
 * - 尝试使用 `document.execCommand("insertText")` 安全地将文字插入到输入框，这能最好地触发 React/Vue 的变更检测。
 * - 作为备选（Fail-safe），如果 `execCommand` 失败，则回退直接赋值，并手动 dispatch `input` 事件触发框架数据更新。
 */
export function writeToInputBox(text: string, inputSelector: string) {
  const inputEl = document.querySelector(inputSelector) as HTMLElement | HTMLInputElement | HTMLTextAreaElement;
  if (!inputEl) {
    Logger.log(t("input_not_found"), "error");
    return;
  }

  const final = buildFinalInputText(inputEl, text);

  setInputBoxText(final, inputEl);
  Logger.log(t("result_written"), "action");
}

export function replaceInputBoxText(text: string, inputSelector: string): boolean {
  const inputEl = document.querySelector<HTMLElement>(inputSelector);
  if (!inputEl) {
    Logger.log(t("input_not_found"), "error");
    return false;
  }

  setInputBoxText(text, inputEl);
  return true;
}

function setInputBoxText(
  text: string,
  inputEl: HTMLElement | HTMLInputElement | HTMLTextAreaElement
) {
  inputEl.focus();
  let success = false;
  try {
    document.execCommand("selectAll", false);
    success = document.execCommand("insertText", false, text);
  } catch {
  }

  if (!success) {
    if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
        (inputEl as HTMLInputElement).value = text;
    } else {
        inputEl.innerText = text;
    }
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * 将工具执行的结果分发交付给聊天页面输入框
 * @param text 要发送的内容
 * @param domSelectors 网页对应选择器配置对象 (从 settings/init 下发)
 * @returns 包含 `{ uploaded: boolean }` 的 Promise 对象，表示内容是否已被当作附件上传了
 * @description
 * - 这是一个关键的分发函数，它会自动判断内容是否超过了内联文本的最大限制(`maxInlineChars`)。
 * - 如果超过了限制且平台支持作为附件上传，它将尝试调用对应的上传函数 (`paste` 模式)。
 * - 如果附件模式上传成功，它会将内容提取到文本文件里，并在输入框中写下简短的提示语引导 AI 读取附件。
 * - 如果附件上传失败，或者内容未超长，它将安全地回退，把全部结果拼接到输入框里。
 */
export async function deliverResult(text: string, domSelectors: SiteSelectors): Promise<{ uploaded: boolean }> {
  const maxInlineChars = typeof domSelectors.maxInlineChars === "number"
    ? domSelectors.maxInlineChars
    : 0;
  const inputEl = document.querySelector<HTMLElement>(domSelectors.inputArea);
  const finalInlineText = inputEl ? buildFinalInputText(inputEl, text) : text;
  const finalInlineLength = finalInlineText.length;

  if (!maxInlineChars || finalInlineLength <= maxInlineChars) {
    writeToInputBox(text, domSelectors.inputArea);
    return { uploaded: false };
  }

  const uploaded = await pasteTextAsAttachment(text, domSelectors);

  if (!uploaded) {
    Logger.log("Attachment upload failed. Falling back to inline result.", "warn");
    writeToInputBox(text, domSelectors.inputArea);
    return { uploaded: false };
  }

  Logger.log(`Attached oversized result as TXT (${finalInlineLength} chars inline)`, "action");

  // Also provide a textual indication inside the input box to the LLM
  const oversizePrompt = i18n.resources.oversize ?? `The result exceeds the character limit. It has been attached as a text file. Please read the attached file for the full details.`;
  writeToInputBox(oversizePrompt, domSelectors.inputArea);

  return { uploaded: true };
}

function buildFinalInputText(
  inputEl: HTMLElement | HTMLInputElement | HTMLTextAreaElement,
  text: string
): string {
  let cur = inputEl.innerText ?? (inputEl as any).value ?? "";
  cur = cur.replace(/\r\n/g, "\n").replace(/\n+/g, "\n").trim();
  const sep = cur ? "\n\n" : "";
  return cur + sep + text;
}

// === 自动发送逻辑 ===
/**
 * 触发智能自动发送（轮询重试机制）
 * @param config 用户插件配置 (如 autoSend: boolean)
 * @param domSelectors 网页对应选择器配置对象 (从 settings/init 下发)
 * @description
 * - 这是发送消息的核心自动机制，它会尝试使用各种可用的方法让当前网页端把回复消息“按出去”。
 * - 初始化时它将清理掉上一次的回车尝试，保证只留一个定时器运作。
 * - 每过 `1000~2000ms`，尝试寻找和触发当前网页的发送方式：
 * - 1. 优先分发一次基于回车键的 `KeyboardEvent`（Ctrl+Enter 和 Enter 分轮次尝试）。
 * - 2. 等待页面完成输入框清空、停止按钮切换等异步渲染。
 * - 3. 如果检测到发送成功，马上停止定时器；否则下一轮才尝试发送按钮。
 * - 4. 如果所有轮次还是失败，系统会弹出通知警告用户。
 */
export function triggerAutoSend(
  config: { autoSend: boolean },
  domSelectors: SiteSelectors
) {
  if (!config.autoSend) {return;}
  if (autoSendTimer) {
    clearTimeout(autoSendTimer);
    autoSendTimer = null;
  }

  let retryCount = 0;
  const maxRetries = AUTO_SEND_ACTIONS.length;

  const getInputEl = () => document.querySelector<HTMLElement>(domSelectors.inputArea);
  const getInputValue = (inputEl: HTMLElement) => (inputEl as any).value ?? inputEl.innerText ?? "";
  const isSendComplete = () => {
    const latestInput = getInputEl();
    if (latestInput && getInputValue(latestInput).trim().length === 0) {
      return true;
    }

    const stopBtn = domSelectors.stopButton ? document.querySelector<HTMLElement>(domSelectors.stopButton) : null;
    return Boolean(stopBtn && isElementVisible(stopBtn));
  };

  const scheduleRetry = () => {
    retryCount++;
    if (retryCount < maxRetries) {
      autoSendTimer = setTimeout(trySend, AUTO_SEND_RETRY_MS);
    } else {
      Logger.log(t("auto_send_timeout"), "error");
      chrome.runtime.sendMessage({
        type: "SHOW_NOTIFICATION",
        title: "Auto-Send Failed",
        message: "Could not send message.",
      });
    }
  };

  const trySend = () => {
    autoSendTimer = null;
    const inputEl = getInputEl();
    if (inputEl) {inputEl.focus();}

    if (isSendComplete()) {
      Logger.log(t("send_success_cleared"), "success");
      return;
    }

    if (inputEl) {
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const action = AUTO_SEND_ACTIONS[retryCount] ?? "enter";
    if (action === "ctrl-enter" || action === "enter") {
      if (inputEl) {
        const withCtrl = action === "ctrl-enter";
        triggerSingleEnter(inputEl, withCtrl);
        Logger.log(`Auto-send fallback: ${withCtrl ? "Ctrl+Enter" : "Enter"} (${retryCount + 1})`, "action");
      } else {
        Logger.log(t("input_not_found"), "error");
      }
    } else {
      const btnNow = document.querySelector<HTMLButtonElement>(domSelectors.sendButton);
      if (isSendButtonReady(btnNow)) {
        const isActuallyStopBtn = domSelectors.stopButton && document.querySelector(domSelectors.stopButton) === btnNow;
        if (!isActuallyStopBtn) {
          triggerButtonSend(btnNow);
          Logger.log(
            `${t("auto_send_attempt")} (${retryCount + 1})`,
            "action"
          );
        }
      } else if (!btnNow) {
        Logger.log(t("send_btn_missing"), "warn");
      } else {
        Logger.log(t("send_btn_disabled"), "warn");
      }
    }

    // 等待页面完成输入框清空、stop 按钮切换等异步渲染；下一轮才尝试另一种发送方式。
    autoSendTimer = setTimeout(() => {
      autoSendTimer = null;
      if (isSendComplete()) {
        Logger.log(t("send_success_cleared"), "success");
        return;
      }

      scheduleRetry();
    }, AUTO_SEND_SETTLE_MS);
  };
  autoSendTimer = setTimeout(trySend, AUTO_SEND_INITIAL_DELAY_MS);
}

/**
 * 模拟 `pasteFile` (粘贴文件) 模式上传文本内容为附件
 * @param text 要作为附件的纯文本内容
 * @param domSelectors 网页对应选择器配置对象 (从 settings/init 下发)
 * @returns 成功返回 `true`，失败返回 `false`
 * @description
 * - 寻找页面上的文本输入区域。
 * - 使用 `DataTransfer` 创造一个虚拟剪贴板，把带有时间戳名字的 TXT 文本文件放入剪贴板内。
 * - 构造并在这个输入区域上主动派发一个 `ClipboardEvent`（即“粘贴”事件）。
 * - 绝大多数先进的 AI 网页平台会立刻读取这个事件并自动把它当作一个图片或者文本文件上传。
 */
async function pasteTextAsAttachment(text: string, domSelectors: SiteSelectors): Promise<boolean> {
  const inputEl = document.querySelector<HTMLElement>(domSelectors.inputArea);
  if (!inputEl) {return false;}

  const filename = `${BRANDING.resultFilePrefix}-${Date.now()}.txt`;
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

  await delay(800);
  return true;
}


/**
 * 检测一个 HTML 元素在网页中是否是实际可见的
 * @param el 待测试的 HTMLElement
 * @returns 元素未被 display:none、未被隐藏并且它的实际大小宽/高等于大于 0 时返回 `true`
 */
function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return false;
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * 简单的异步等待函数
 * @param ms 毫秒
 * @returns 包装了一个 `setTimeout` 的 `Promise` 对象
 */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 确认当前发现的发送按钮是不是真的“激活”
 * @param btn 发现的发送 HTMLButtonElement
 * @returns 它是有效的按钮则返回 `true`，如果是 `disabled`，`aria-disabled` 或者不可见的则返回 `false`
 */
function isSendButtonReady(btn: HTMLButtonElement | null): btn is HTMLButtonElement {
  if (!btn) {return false;}
  if (btn.disabled) {return false;}
  if (btn.getAttribute("aria-disabled") === "true") {return false;}

  return isElementVisible(btn);
}

/**
 * 发送一组真实的鼠标交互事件来强行触发按钮被点击的效果
 * @param btn 待点击的网页发送按钮
 * @returns 始终返回 `true` 代表动作执行结束。但不能保证网页侧逻辑正确发了。
 * @description
 * - 针对许多采用 `React/Vue/Svelte` 单页面应用的特性，单独的 `click()` 可能无法触发业务上的响应，甚至被拦截或者需要搭配 mouseDown。
 * - 为了更高的兼容率，派发一系列从按下鼠标到松开的完整 `MouseEvent` 组合： `pointerdown`, `mousedown`, `pointerup`, `mouseup`, 接着执行最后点击。
 */
function triggerButtonSend(btn: HTMLElement): boolean {
  btn.focus();
  const mouseEventTypes: Array<"pointerdown" | "mousedown" | "pointerup" | "mouseup"> = [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
  ];

  for (const type of mouseEventTypes) {
    btn.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
  }

  // btn.click() itself dispatches one click event; avoid dispatching a second synthetic click above.
  btn.click();
  return true;
}

/**
 * 主动抛出单独的 “回车键” 或 “Ctrl+回车键” 以尝试发送
 * @param inputEl 需要被回车事件触发的网页聊天输入框
 * @param withCtrl 若是 `true` 抛出带 Ctrl 的 Enter，否则是不带修饰键的 Enter
 * @description
 * - 针对许多采用 `React/Vue/Svelte` 的 AI 平台由于不支持普通的按钮点击（或无法选中按钮）导致发送失败。
 * - 该机制直接把 `keydown`, `keypress` 和 `keyup` 的事件连击强塞给聊天输入框，以此模拟人类“按下回车”。
 */
function triggerSingleEnter(inputEl: HTMLElement, withCtrl: boolean) {
  inputEl.focus();
  const init: KeyboardEventInit = {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
    ctrlKey: withCtrl,
    shiftKey: false
  };
  inputEl.dispatchEvent(new KeyboardEvent("keydown", init));
  inputEl.dispatchEvent(new KeyboardEvent("keypress", init));
  inputEl.dispatchEvent(new KeyboardEvent("keyup", init));
}

export function showAutoInitConfirm(): Promise<boolean> {
  return new Promise((resolve) => {
    const isZh = i18n.lang === "zh";
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
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; justify-content: center; align-items: center; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .card { width: min(420px, calc(100vw - 40px)); background: #fff; color: #202124; border: 1px solid #dadce0; border-radius: 8px; box-shadow: 0 12px 34px rgba(0,0,0,0.28); padding: 20px; }
      h2 { margin: 0 0 10px 0; font-size: 18px; font-weight: 650; line-height: 1.3; color: #202124; }
      p { margin: 0; color: #5f6368; font-size: 14px; line-height: 1.5; }
      .buttons { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
      button { font: inherit; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 8px 14px; cursor: pointer; border: 1px solid #dadce0; background: #fff; color: #3c4043; }
      button:hover { background: #f8fafd; }
      .primary { border-color: #1a73e8; background: #1a73e8; color: #fff; }
      .primary:hover { background: #1765cc; }
    `;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="card" role="dialog" aria-modal="true">
        <h2>${isZh ? "添加 webcode 初始化提示词？" : "Add webcode initialization prompt?"}</h2>
        <p>${isZh ? "将输入框中的 /webcode 或 @webcode 替换为初始化提示词。不会自动发送。" : "Replace /webcode or @webcode in the input with the initialization prompt. This will not send automatically."}</p>
        <div class="buttons">
          <button class="cancel" type="button">${isZh ? "取消" : "Cancel"}</button>
          <button class="primary" type="button">${isZh ? "添加" : "Add"}</button>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(overlay);

    const cleanup = (result: boolean) => {
      document.removeEventListener("keydown", onKeyDown, true);
      host.remove();
      resolve(result);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        cleanup(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cleanup(false);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    shadow.querySelector(".primary")?.addEventListener("click", () => cleanup(true));
    shadow.querySelector(".cancel")?.addEventListener("click", () => cleanup(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cleanup(false);
      }
    });
    shadow.querySelector<HTMLButtonElement>(".primary")?.focus();
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
  host.setAttribute("contenteditable", "plaintext-only");
  host.setAttribute("spellcheck", "false");
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

  const safeArgs = escapeHtml(JSON.stringify(payload.arguments ?? {}, null, 2));
  const safeName = escapeHtml(payload.name);
  const safePurpose = escapeHtml((payload as any).purpose ?? "No purpose provided.");
  const commandValue = typeof payload.arguments?.command === "string"
    ? payload.arguments.command.trim().replace(/\s+/g, " ")
    : "";
  const isCommandScopedApproval = (payload.name === "execute_command" || payload.name === "run_in_terminal") && Boolean(commandValue);
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

  if (btnAllowExecutable) {
    btnAllowExecutable.onclick = () => {
      closeModal();
      onConfirm('executable');
    };
  }

  if (btnAllowPrefix) {
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
}

/**
 * 从一行待审批执行的命令中获取它的第一段程序名称
 * @param command 带有参数的执行命令
 * @returns 基础可执行文件名称
 */
function getCommandExecutable(command: string): string {
  const tokens = tokenizeCommandLine(command);
  return tokens[0] || command;
}

/**
 * 从一行待审批执行的命令中获取命令的主体及其第一个参数的前缀模式
 * @param command 带有参数的执行命令
 * @returns 基础可执行文件名称+第一项参数的前两截，例如：`git commit` 或者 `npm install`
 */
function getCommandPrefix(command: string): string {
  const tokens = tokenizeCommandLine(command);
  if (tokens.length <= 1) {
    return command;
  }

  return tokens.slice(0, 2).join(" ");
}

/**
 * 提供将长段带有各种空格与引号的命令行文字转为单词数组
 * @param command 将被切分的命令行语句
 * @returns 参数字符串切片的 Token 数组
 */
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
