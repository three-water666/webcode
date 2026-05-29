import { BRANDING, PROTOCOL } from "@webcode/shared";
import type { SiteSelectors } from "../modules/config";
import { i18n } from "../modules/i18n";
import { Logger } from "../modules/logger";
import { pasteTextAsAttachment } from "../modules/result_delivery";
import * as UI from "../modules/ui";
import { buildWebcodeInitPrompt } from "./init_context";

interface AutoInitPromptControllerOptions {
  getSelectors: () => SiteSelectors | null;
  isClientConnected: () => boolean;
  loadPromptsFromStorage: () => Promise<void>;
}

interface AutoInitPromptContext {
  inputEl: HTMLElement;
  currentText: string;
  initPrompt: string;
  mode: AutoInitPromptMode;
}

interface AutoInitTrigger {
  replacementStart: number;
  end: number;
}

type AutoInitPromptMode = "replace-trigger" | "append-forgotten";

type AutoInitPromptCandidate = Omit<AutoInitPromptContext, "initPrompt">;

const AUTO_INIT_CHECK_DELAYS_MS = [0, 50, 150, 350];
const AUTO_INIT_EVENT_TYPES = [
  "beforeinput",
  "input",
  "keyup",
  "paste",
  "compositionend",
  "change",
  "focusin",
] as const;
const AUTO_INIT_TRIGGER_TOKEN_RE = /(?:\/webcode|@webcode)(?=$|[\s\n.,，。!?！？:：;；])/gi;
const AUTO_INIT_INVALID_PREFIX_RE = /[A-Za-z0-9_/@.]/;
const AUTO_INIT_IGNORABLE_PREFIX_RE = /[\s\u00a0\uFEFF\u200B]/;
const AUTO_INIT_ATTACHMENT_FILENAME_PREFIX = `${BRANDING.slug}-init-context`;

export class AutoInitPromptController {
  private listenerStarted = false;
  private modalOpen = false;
  private lastPromptedText = "";
  private lastObservedUrl = location.href;

  public constructor(private readonly options: AutoInitPromptControllerOptions) {}

  public setupTrigger(): void {
    if (this.listenerStarted) {return;}
    this.listenerStarted = true;

    for (const eventType of AUTO_INIT_EVENT_TYPES) {
      document.addEventListener(eventType, () => this.scheduleCheck(), true);
    }
    document.addEventListener("keydown", (event) => this.handleKeyDown(event), true);
    document.addEventListener("click", (event) => this.handleClick(event), true);
  }

  public scheduleCheck(): void {
    for (const delay of AUTO_INIT_CHECK_DELAYS_MS) {
      setTimeout(() => {
        this.refreshPromptDedupState();
        void this.maybePromptAutoInit();
      }, delay);
    }
  }

  private refreshPromptDedupState(): void {
    const currentUrl = location.href;
    if (currentUrl !== this.lastObservedUrl) {
      this.lastObservedUrl = currentUrl;
      this.lastPromptedText = "";
      return;
    }

    const selectors = this.options.getSelectors();
    if (!selectors) {return;}
    if (hasVisibleMessageBlock(selectors)) {
      this.lastPromptedText = "";
      return;
    }

    const inputEl = this.findCurrentInputElement(false);
    if (inputEl && !getInputText(inputEl).trim()) {
      this.lastPromptedText = "";
    }
  }

  private async maybePromptAutoInit(): Promise<void> {
    const candidate = this.getTriggeredPromptCandidate(true);
    if (!candidate) {return;}

    if (!await this.loadInitPrompt()) {return;}

    await this.promptAndMaybeInsert(candidate);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!isEnterSendIntent(event)) {return;}
    this.maybePromptBeforeSend(event, true);
  }

  private handleClick(event: MouseEvent): void {
    if (!isPrimaryClick(event)) {return;}

    const selectors = this.options.getSelectors();
    if (!selectors || !isSendButtonEvent(event, selectors.sendButton)) {return;}

    this.maybePromptBeforeSend(event, false);
  }

  private maybePromptBeforeSend(event: Event, requireActiveInput: boolean): void {
    const candidate = this.getTriggeredPromptCandidate(requireActiveInput) ??
      this.getForgottenPromptCandidate(requireActiveInput);
    if (!candidate) {return;}

    if (!this.getLoadedInitPrompt()) {
      void this.loadInitPrompt();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    void this.promptAndMaybeInsert(candidate);
  }

  private async promptAndMaybeInsert(candidate: AutoInitPromptCandidate): Promise<void> {
    this.lastPromptedText = candidate.currentText;
    this.modalOpen = true;

    try {
      const confirmed = await UI.showAutoInitConfirm();
      if (!confirmed) {return;}

      const initPrompt = await this.buildDirectInitPrompt();
      if (!initPrompt) {return;}

      await this.insertInitPrompt({
        ...candidate,
        initPrompt,
      });
    } finally {
      this.modalOpen = false;
    }
  }

  private getTriggeredPromptCandidate(requireActiveInput: boolean): AutoInitPromptCandidate | null {
    const selectors = this.options.getSelectors();
    if (!selectors || !this.options.isClientConnected() || this.modalOpen) {
      return null;
    }
    if (!isPristineConversation(selectors)) {return null;}

    const inputEl = this.findCurrentInputElement(requireActiveInput);
    if (!inputEl) {return null;}

    const currentText = getInputText(inputEl);
    if (!findAutoInitTrigger(currentText)) {return null;}
    if (currentText === this.lastPromptedText) {return null;}

    return {
      inputEl,
      currentText,
      mode: "replace-trigger",
    };
  }

  private getForgottenPromptCandidate(requireActiveInput: boolean): AutoInitPromptCandidate | null {
    const selectors = this.options.getSelectors();
    if (!selectors || !this.options.isClientConnected() || this.modalOpen) {
      return null;
    }
    if (!isPristineConversation(selectors)) {return null;}

    const inputEl = this.findCurrentInputElement(requireActiveInput);
    if (!inputEl) {return null;}

    const currentText = getInputText(inputEl);
    if (!currentText.trim()) {return null;}
    if (currentText === this.lastPromptedText) {return null;}
    if (findAutoInitTrigger(currentText)) {return null;}
    if (hasInitializationContextMarker(currentText)) {return null;}

    return {
      inputEl,
      currentText,
      mode: "append-forgotten",
    };
  }

  private getLoadedInitPrompt(): string | null {
    return i18n.resources.init ?? null;
  }

  private async loadInitPrompt(): Promise<string | null> {
    if (!i18n.resources.init) {
      try {
        await this.options.loadPromptsFromStorage();
      } catch (error) {
        Logger.log(`Initialization prompt load failed: ${getErrorMessage(error)}`, "error");
        return null;
      }
    }
    return this.getLoadedInitPrompt();
  }

  private async buildDirectInitPrompt(): Promise<string | null> {
    const fallbackInitPrompt = await this.loadInitPrompt();
    if (!fallbackInitPrompt) {return null;}

    try {
      return await buildWebcodeInitPrompt({ includeInitToolResultHeader: false });
    } catch (error) {
      Logger.log(`Direct initialization prompt build failed: ${getErrorMessage(error)}`, "error");
      return fallbackInitPrompt;
    }
  }

  private async insertInitPrompt(context: AutoInitPromptContext): Promise<void> {
    const selectors = this.options.getSelectors();
    if (!selectors) {return;}

    const latestInput = context.inputEl.isConnected
      ? context.inputEl
      : this.findCurrentInputElement(false);
    if (!latestInput) {return;}

    const latestText = getInputText(latestInput);
    if (hasInitializationContextMarker(latestText)) {return;}

    const replacement = await this.buildReplacementForCurrentInput(context, latestText, selectors);
    if (!replacement) {return;}

    if (UI.replaceInputBoxText(replacement, selectors.inputArea)) {
      this.lastPromptedText = replacement;
      Logger.log("Inserted webcode initialization prompt", "action");
    }
  }

  private findCurrentInputElement(requireActive: boolean): HTMLElement | null {
    const selectors = this.options.getSelectors();
    if (!selectors) {return null;}

    const candidates = UI.getInputAreaCandidates(selectors);
    if (candidates.length === 0) {return null;}

    const activeInput = candidates.find((candidate) => isActiveInput(candidate));
    if (activeInput) {return activeInput;}

    if (requireActive) {return null;}
    return candidates.find((candidate) => isVisibleElement(candidate)) ?? candidates[0] ?? null;
  }

  private async buildReplacementForCurrentInput(
    context: AutoInitPromptContext,
    latestText: string,
    selectors: SiteSelectors
  ): Promise<string | null> {
    const replacement = buildReplacementForContext(context, latestText);
    if (!replacement) {return null;}

    const maxInlineChars = getMaxInlineChars(selectors);
    if (!maxInlineChars || replacement.length <= maxInlineChars) {
      return replacement;
    }

    const uploaded = await pasteTextAsAttachment(
      context.initPrompt,
      selectors,
      AUTO_INIT_ATTACHMENT_FILENAME_PREFIX
    );

    if (uploaded) {
      Logger.log(`Attached oversized ${BRANDING.productName} initialization context`, "action");
      return buildReplacementForContext(
        { ...context, initPrompt: buildOversizedInitPromptNotice() },
        latestText
      );
    }

    Logger.log("Initialization context attachment failed. Falling back to the webcode_init command prompt.", "warn");
    const fallbackInitPrompt = this.getLoadedInitPrompt();
    if (!fallbackInitPrompt) {return null;}
    return buildReplacementForContext({ ...context, initPrompt: fallbackInitPrompt }, latestText);
  }
}

function findAutoInitTrigger(text: string): AutoInitTrigger | null {
  AUTO_INIT_TRIGGER_TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = AUTO_INIT_TRIGGER_TOKEN_RE.exec(text)) !== null) {
    const tokenStart = match.index;
    const previousChar = tokenStart > 0 ? text[tokenStart - 1] : "";

    if (AUTO_INIT_INVALID_PREFIX_RE.test(previousChar)) {
      continue;
    }

    let replacementStart = tokenStart;
    while (replacementStart > 0 && AUTO_INIT_IGNORABLE_PREFIX_RE.test(text[replacementStart - 1])) {
      replacementStart--;
    }

    return {
      replacementStart,
      end: tokenStart + match[0].length,
    };
  }

  return null;
}

function buildInitReplacement(text: string, trigger: AutoInitTrigger, initPrompt: string): string {
  const beforeTrigger = text.slice(0, trigger.replacementStart);
  const afterTrigger = text.slice(trigger.end);
  const prefix = beforeTrigger.trim() ? "\n\n" : "";
  return `${beforeTrigger}${prefix}${initPrompt.trim()}\n\n${afterTrigger}`;
}

function buildReplacementForContext(context: AutoInitPromptContext, latestText: string): string | null {
  if (context.mode === "replace-trigger") {
    const latestTrigger = findAutoInitTrigger(latestText);
    if (!latestTrigger) {return null;}
    return buildInitReplacement(latestText, latestTrigger, context.initPrompt);
  }

  if (!latestText.trim()) {return null;}
  return buildForgottenInitReplacement(latestText, context.initPrompt);
}

function buildForgottenInitReplacement(text: string, initPrompt: string): string {
  const beforeInitPrompt = text.trimEnd();
  const prefix = beforeInitPrompt.trim() ? "\n\n" : "";
  return `${beforeInitPrompt}${prefix}${initPrompt.trim()}`;
}

function buildOversizedInitPromptNotice(): string {
  if (i18n.lang === "zh") {
    return [
      "完整初始化上下文超过当前输入框字符限制，webcode 已将其作为 txt 附件添加到本条消息。",
      "请读取附件内容作为本次会话的 webcode 初始化上下文，并根据上面的用户任务继续。",
    ].join("\n");
  }

  return [
    "The full initialization context exceeds this input box character limit, so webcode attached it as a txt file to this message.",
    "Read the attachment as the webcode initialization context for this session, then continue with the user task above.",
  ].join("\n");
}

function getMaxInlineChars(selectors: SiteSelectors): number {
  return typeof selectors.maxInlineChars === "number" && selectors.maxInlineChars > 0
    ? selectors.maxInlineChars
    : 0;
}

function isEnterSendIntent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) {return false;}
  if (event.key !== "Enter") {return false;}
  if (event.isComposing) {return false;}
  return !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
}

function isPrimaryClick(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0;
}

function isSendButtonEvent(event: MouseEvent, sendButtonSelector: string): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {return false;}

  try {
    return Boolean(target.closest(sendButtonSelector));
  } catch {
    return false;
  }
}

function isActiveInput(inputEl: HTMLElement): boolean {
  const activeEl = document.activeElement;
  return activeEl === inputEl || Boolean(activeEl) && inputEl.contains(activeEl);
}

function getInputText(inputEl: HTMLElement | HTMLInputElement | HTMLTextAreaElement): string {
  if (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement) {
    return inputEl.value;
  }
  return inputEl.innerText ?? inputEl.textContent ?? "";
}

function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {return false;}

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function hasVisibleMessageBlock(selectors: SiteSelectors): boolean {
  try {
    return Array.from(document.querySelectorAll<HTMLElement>(selectors.messageBlocks))
      .some((element) => isVisibleElement(element));
  } catch {
    return true;
  }
}

function isPristineConversation(selectors: SiteSelectors): boolean {
  if (UI.isStopButtonVisible(selectors)) {return false;}
  return !hasVisibleMessageBlock(selectors);
}

function hasInitializationContextMarker(text: string): boolean {
  const normalizedText = normalizePromptMarkerText(text);
  if (!normalizedText) {return false;}

  if (normalizedText.includes(PROTOCOL.initToolName.toLowerCase())) {
    return true;
  }

  if (
    hasResourcePromptMarker(normalizedText, i18n.resources.prompt) ||
    hasResourcePromptMarker(normalizedText, i18n.resources.init)
  ) {
    return true;
  }

  return hasOversizedInitPromptNoticeMarker(normalizedText) ||
    hasProtocolPromptScaffoldMarker(normalizedText);
}

function hasResourcePromptMarker(normalizedText: string, resource: string | null): boolean {
  const marker = getResourcePromptMarker(resource);
  return Boolean(marker && normalizedText.includes(marker));
}

function getResourcePromptMarker(resource: string | null): string | null {
  if (!resource) {return null;}

  const normalizedResource = normalizePromptMarkerText(resource);
  if (!normalizedResource) {return null;}

  return normalizedResource.slice(0, Math.min(400, normalizedResource.length));
}

function hasOversizedInitPromptNoticeMarker(normalizedText: string): boolean {
  return normalizedText.includes("完整初始化上下文超过当前输入框字符限制") ||
    normalizedText.includes("full initialization context exceeds this input box character limit");
}

function hasProtocolPromptScaffoldMarker(normalizedText: string): boolean {
  return normalizedText.includes("mcp_action") &&
    normalizedText.includes("request_id") &&
    normalizedText.includes("available tools") &&
    (
      normalizedText.includes("# 通信协议 (protocol)") ||
      normalizedText.includes("# protocol")
    );
}

function normalizePromptMarkerText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .toLowerCase();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
