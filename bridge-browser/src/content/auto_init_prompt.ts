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
}

interface AutoInitTrigger {
  replacementStart: number;
  end: number;
}

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

  public constructor(private readonly options: AutoInitPromptControllerOptions) {}

  public setupTrigger(): void {
    if (this.listenerStarted) {return;}
    this.listenerStarted = true;

    for (const eventType of AUTO_INIT_EVENT_TYPES) {
      document.addEventListener(eventType, () => this.scheduleCheck(), true);
    }
  }

  public scheduleCheck(): void {
    for (const delay of AUTO_INIT_CHECK_DELAYS_MS) {
      setTimeout(() => {
        void this.maybePromptAutoInit();
      }, delay);
    }
  }

  private async maybePromptAutoInit(): Promise<void> {
    const context = await this.getPromptContext();
    if (!context) {return;}

    this.lastPromptedText = context.currentText;
    this.modalOpen = true;
    const confirmed = await UI.showAutoInitConfirm();
    this.modalOpen = false;

    if (!confirmed) {return;}
    this.insertInitPrompt(context);
  }

  private async getPromptContext(): Promise<AutoInitPromptContext | null> {
    if (!this.options.getSelectors() || !this.options.isClientConnected() || this.modalOpen) {
      return null;
    }

    const inputEl = this.findCurrentInputElement(true);
    if (!inputEl) {return null;}

    const currentText = getInputText(inputEl);
    if (!findAutoInitTrigger(currentText)) {return null;}
    if (currentText === this.lastPromptedText) {return null;}

    const initPrompt = await this.getInitPrompt();
    if (!initPrompt) {return null;}

    return {
      inputEl,
      currentText,
      initPrompt,
    };
  }

  private async getInitPrompt(): Promise<string | null> {
    if (!i18n.resources.init) {
      await this.options.loadPromptsFromStorage();
    }
    return i18n.resources.init ?? null;
  }

  private insertInitPrompt(context: AutoInitPromptContext): void {
    const selectors = this.options.getSelectors();
    if (!selectors) {return;}

    const latestInput = context.inputEl.isConnected
      ? context.inputEl
      : this.findCurrentInputElement(false);
    if (!latestInput) {return;}

    const latestText = getInputText(latestInput);
    const latestTrigger = findAutoInitTrigger(latestText);
    if (!latestTrigger) {return;}

    const replacement = buildInitReplacement(latestText, latestTrigger, context.initPrompt);
    if (UI.replaceInputBoxText(replacement, selectors.inputArea)) {
      this.lastPromptedText = replacement;
      Logger.log("Inserted webcode initialization prompt", "action");
    }
  }

  private findCurrentInputElement(requireActive: boolean): HTMLElement | null {
    const selectors = this.options.getSelectors();
    if (!selectors) {return null;}

    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selectors.inputArea));
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
