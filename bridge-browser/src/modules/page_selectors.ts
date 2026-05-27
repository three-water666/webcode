import { type SiteSelectors } from "./config";
import { isElementVisible } from "./dom_helpers";

export interface LatestResponseCodeBlocks {
  messageIndex: number;
  codeElements: Element[];
}

export function getInputAreaBySelector(
  inputSelector: string
): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(inputSelector));
  if (candidates.length === 0) {return null;}

  return candidates.find((candidate) => isActiveInput(candidate))
    ?? candidates.find((candidate) => isElementVisible(candidate))
    ?? candidates[0]
    ?? null;
}

export function getInputAreaElement(domSelectors: SiteSelectors): HTMLElement | null {
  return getInputAreaBySelector(domSelectors.inputArea);
}

export function getInputAreaCandidates(domSelectors: SiteSelectors): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(domSelectors.inputArea));
}

export function focusInputArea(domSelectors: SiteSelectors): void {
  getInputAreaElement(domSelectors)?.focus();
}

export function getSendButton(domSelectors: SiteSelectors): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(domSelectors.sendButton);
}

export function getStopButton(domSelectors: SiteSelectors): HTMLElement | null {
  return domSelectors.stopButton
    ? document.querySelector<HTMLElement>(domSelectors.stopButton)
    : null;
}

export function hasStopButton(domSelectors: SiteSelectors): boolean {
  return Boolean(getStopButton(domSelectors));
}

export function isStopButtonVisible(domSelectors: SiteSelectors): boolean {
  const stopBtn = getStopButton(domSelectors);
  return Boolean(stopBtn && isElementVisible(stopBtn));
}

function isActiveInput(inputEl: HTMLElement): boolean {
  const activeEl = document.activeElement;
  return activeEl === inputEl || Boolean(activeEl) && inputEl.contains(activeEl);
}

export function isSendButtonActuallyStopButton(
  domSelectors: SiteSelectors,
  button: HTMLButtonElement
): boolean {
  return Boolean(domSelectors.stopButton && getStopButton(domSelectors) === button);
}

export function getLatestResponseCodeBlocks(
  domSelectors: SiteSelectors
): LatestResponseCodeBlocks | null {
  const messages = document.querySelectorAll(domSelectors.messageBlocks);
  if (messages.length === 0) { return null; }

  const messageIndex = messages.length - 1;
  const lastMessage = messages[messageIndex];
  const codeElements = Array.from(lastMessage.querySelectorAll(domSelectors.codeBlocks));

  return {
    messageIndex,
    codeElements,
  };
}
