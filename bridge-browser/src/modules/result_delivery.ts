import { BRANDING } from "@webcode/shared";
import { type SiteSelectors } from "./config";
import { i18n, t } from "./i18n";
import { Logger } from "./logger";
import { delay } from "./dom_helpers";
import { getInputAreaBySelector, getInputAreaElement } from "./page_selectors";

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
  const inputEl = getInputAreaBySelector(inputSelector);
  if (!inputEl) {
    Logger.log(t("input_not_found"), "error");
    return;
  }

  const final = buildFinalInputText(inputEl, text);

  setInputBoxText(final, inputEl);
  Logger.log(t("result_written"), "action");
}

export function replaceInputBoxText(text: string, inputSelector: string): boolean {
  const inputEl = getInputAreaBySelector(inputSelector);
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
  const inputEl = getInputAreaElement(domSelectors);
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
  const inputEl = getInputAreaElement(domSelectors);
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
