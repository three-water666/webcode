import { PROTOCOL } from "@webcode/shared";
import type { SiteSelectors } from "../modules/config";
import { i18n } from "../modules/i18n";
import { Logger } from "../modules/logger";
import * as UI from "../modules/ui";

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

    const initPrompt = await this.loadInitPrompt();
    if (!initPrompt) {return;}

    await this.promptAndMaybeInsert(candidate, initPrompt);
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

    const initPrompt = this.getLoadedInitPrompt();
    if (!initPrompt) {
      void this.loadInitPrompt();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    void this.promptAndMaybeInsert(candidate, initPrompt);
  }

  private async promptAndMaybeInsert(
    candidate: AutoInitPromptCandidate,
    initPrompt: string
  ): Promise<void> {
    this.lastPromptedText = candidate.currentText;
    this.modalOpen = true;

    try {
      const confirmed = await UI.showAutoInitConfirm();
      if (!confirmed) {return;}

      this.insertInitPrompt({
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
    if (hasInitPromptMarker(currentText)) {return null;}

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

  private insertInitPrompt(context: AutoInitPromptContext): void {
    const selectors = this.options.getSelectors();
    if (!selectors) {return;}

    const latestInput = context.inputEl.isConnected
      ? context.inputEl
      : this.findCurrentInputElement(false);
    if (!latestInput) {return;}

    const latestText = getInputText(latestInput);
    if (hasInitPromptMarker(latestText)) {return;}

    const replacement = buildReplacementForContext(context, latestText);
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

function hasInitPromptMarker(text: string): boolean {
  return text.includes(PROTOCOL.initToolName);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
