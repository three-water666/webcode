import { Logger, t, i18n } from './utils';
import { ToolExecutionPayload } from '../types';
import { SiteSelectors } from './config';

let autoSendTimer: NodeJS.Timeout | null = null;
export type CommandApprovalScope = false | 'exact' | 'executable' | 'prefix';

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

// === 视觉标记 ===

// 状态 1: 处理中 (蓝色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“处理中”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为蓝色，表示该 MCP 工具请求已被捕获并正在排队或执行中。
 */
export function markVisualProcessing(element: HTMLElement) {
  if (element.dataset.mcpState === "processing") {return;}
  element.dataset.mcpState = "processing";
  element.dataset.mcpVisual = "true";
  element.style.border = "2px solid #2196F3"; // Blue
  element.style.borderRadius = "4px";
  element.style.transition = "border-color 0.3s ease";
}

// 状态 2: 成功 (绿色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“执行成功”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为绿色，表示 MCP 工具已经执行完毕且结果已写回给大模型。
 */
export function markVisualSuccess(element: HTMLElement) {
  if (element.dataset.mcpState === "success") {return;}
  element.dataset.mcpState = "success";
  element.dataset.mcpVisual = "true";
  element.style.border = "2px solid #00E676"; // Green
  element.style.borderRadius = "4px";
}

// 状态 3: 错误 (红色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“执行失败/错误”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为红色，表示该工具调用在执行或 JSON 解析阶段发生错误，或被用户人工拒绝。
 */
export function markVisualError(element: HTMLElement) {
  if (element.dataset.mcpState === "error") {return;}
  element.dataset.mcpState = "error";
  element.dataset.mcpVisual = "true";
  element.style.border = "2px solid #F44336"; // Red
  element.style.borderRadius = "4px";
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

/**
 * 将工具执行的结果分发交付给聊天页面输入框
 * @param text 要发送的内容
 * @param domSelectors 网页对应选择器配置对象 (从 settings/init 下发)
 * @returns 包含 `{ uploaded: boolean }` 的 Promise 对象，表示内容是否已被当作附件上传了
 * @description
 * - 这是一个关键的分发函数，它会自动判断内容是否超过了内联文本的最大限制(`maxInlineChars`)。
 * - 如果超过了限制且平台支持作为附件上传，它将尝试调用对应的上传函数 (`fileInput` 模式或 `paste` 模式)。
 * - 如果附件模式上传成功，它会将内容提取到文本文件里，并在输入框中写下简短的提示语引导 AI 读取附件。
 * - 如果附件上传失败，或者内容未超长，它将安全地回退，把全部结果拼接到输入框里。
 */
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

  // Also provide a textual indication inside the input box to the LLM
  const oversizePrompt = i18n.resources.oversize || `The result exceeds the character limit. It has been attached as a text file. Please read the attached file for the full details.`;
  writeToInputBox(oversizePrompt, domSelectors.inputArea);

  return { uploaded: true };
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
 * - 1. 分发一次基于回车键的 `KeyboardEvent`（一次使用 Ctrl，下一次不使用 Ctrl 切换尝试）。
 * - 2. 等待 `200ms` 让目标网页的 JavaScript （React/Vue 等）响应和重新渲染 DOM 界面。
 * - 3. 检查：当前输入框是被清空了（说明已发送），还是出现了代表模型思考中的“停止”按钮？如果检测到任何发送成功的特征，马上停止定时器。
 * - 4. 否则，继续寻找真正的“发送”按钮并发送鼠标 `click` 等事件强行点击。
 * - 5. 如果重试 5 次还是失败，系统会弹出通知警告用户。
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
  const maxRetries = 5;

  const trySend = () => {
    const inputEl = document.querySelector(domSelectors.inputArea) as HTMLElement;
    if (inputEl) {inputEl.focus();}

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

    // 优先尝试回车发送
    if (inputEl) {
      if (retryCount % 2 === 0) {
        // First try Ctrl+Enter
        triggerSingleEnter(inputEl, true);
        Logger.log(`Auto-send fallback: Ctrl+Enter (${retryCount + 1})`, "action");
      } else {
        // Then try normal Enter
        triggerSingleEnter(inputEl, false);
        Logger.log(`Auto-send fallback: Enter (${retryCount + 1})`, "action");
      }
    }

    // 使用 RequestAnimationFrame 或短定时器等待 DOM 渲染更新
    setTimeout(() => {
      let isSending = false;

      // 再次检查输入框是否已经被网页清空，这说明确切发出去了
      const currentValCheck = inputEl ? ((inputEl as any).value || inputEl.innerText || "") : "";
      if (currentValCheck.trim().length === 0) {
        isSending = true;
      }

      // 如果成功发出去
      if (isSending) {
         Logger.log(t("send_success_cleared"), "success");
         return; // 不再进入下一次 retry，也不再点按钮
      }

      // 尝试寻找停止按钮，如果刚按了回车页面出现了停止按钮，说明发送成功了且已进入生成状态
      const stopBtn = domSelectors.stopButton ? document.querySelector(domSelectors.stopButton) : null;
      if (stopBtn && isElementVisible(stopBtn as HTMLElement)) {
        Logger.log(t("send_success_cleared"), "success");
        return; // 不再进入下一次 retry，也不再点发送/停止按钮
      }

      // 此时既没有清空输入框，也没有变成生成状态，说明回车失效了。可以尝试点发送按钮。
      let triggered = false;
      const btnNow = document.querySelector(domSelectors.sendButton) as HTMLButtonElement | null;
      if (isSendButtonReady(btnNow)) {
        // 再次确认一下，我们要点的真的是发送按钮，不是由于选择器重叠导致的停止按钮
        const isActuallyStopBtn = domSelectors.stopButton && document.querySelector(domSelectors.stopButton) === btnNow;
        if (!isActuallyStopBtn) {
            triggered = triggerButtonSend(btnNow!);
            if (triggered) {
              Logger.log(
                `${t("auto_send_attempt")} (${retryCount + 1})`,
                "action"
              );
            }
        }
      } else if (!btnNow) {
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
    }, 200); // 留出 200ms 的窗口给 React/Vue 渲染
  };
  autoSendTimer = setTimeout(trySend, 1000);
}

/**
 * 模拟 `fileInput` 模式上传文本内容为附件
 * @param text 要作为附件的纯文本内容
 * @param domSelectors 网页对应选择器配置对象 (从 settings/init 下发)
 * @returns 成功返回 `true`，失败返回 `false`
 * @description
 * - 尝试找到页面上的 `<input type="file">` 元素。
 * - 如果找不到，尝试点击一次预设的 `attachButton` 弹出选择文件的对话框，并等待 DOM 显示该 fileInput。
 * - 成功找到 fileInput 后，使用 `DataTransfer` 模拟创建并附加一个新的文本文件 (TXT) 并赋予其带有时间戳的文件名。
 * - 将 `DataTransfer` 里的文件集合赋予 input，并发射 `change` 等事件以触发上传逻辑。
 * - 如果网页有预设的 `attachmentReadyIndicator` (附件预览完成的标识选择器)，会进一步等待该指示器显现。
 */
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
 * - 如果网页有预设的 `attachmentReadyIndicator` (附件预览完成的标识选择器)，会进一步等待该指示器显现。
 */
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

/**
 * 在页面 DOM 中寻找能够接收文件上传的 `<input type="file">` 元素
 * @param selector 可选，用户自定义的精确文件输入框选择器
 * @returns 找到的 HTMLInputElement 对象，如果没找到则返回 `null`
 */
function queryFileInput(selector?: string): HTMLInputElement | null {
  if (selector) {
    return document.querySelector(selector) as HTMLInputElement | null;
  }

  return document.querySelector('input[type="file"]') as HTMLInputElement | null;
}

/**
 * 等待网页显示给定的 DOM 附件准备指示器
 * @param selector (如 CSS 选择器) 指示器
 * @param timeoutMs 最大超时毫秒
 * @returns 成功展示返回 `true`，失败超时返回 `false`
 * @description
 * - 这是一个 `Promise`，用 `isElementVisible` 检测 DOM。每 200ms 重试一次。如果在超时前找到，说明附件上传处理完毕。
 */
async function waitForAttachmentReady(selector: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el && isElementVisible(el)) {return true;}
    await delay(200);
  }
  return false;
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
