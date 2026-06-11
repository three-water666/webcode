import { type SiteSelectors } from "./config";
import { isElementVisible } from "./dom_helpers";

export interface LatestResponseCodeBlocks {
  messageIndex: number;
  codeElements: Element[];
}

interface ScrollMetrics {
  distanceToBottom: number;
  progress: number;
  range: number;
  thumbRatio: number;
}

const HISTORY_SCROLL_MIN_RANGE_PX = 800;
const HISTORY_SCROLL_MIN_DISTANCE_TO_BOTTOM_PX = 600;
const HISTORY_SCROLL_MAX_PROGRESS = 0.8;
const HISTORY_SCROLL_MAX_THUMB_RATIO = 0.65;
const MIN_SCROLL_CONTAINER_HEIGHT_PX = 300;

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

export function isLikelyViewingVirtualizedHistory(domSelectors: SiteSelectors): boolean {
  if (domSelectors.virtualizedMessages !== true) {return false;}

  const scrollElement = getPrimaryScrollElement(domSelectors);
  if (!scrollElement) {return false;}

  const metrics = getScrollMetrics(scrollElement);
  if (!metrics) {return false;}

  return metrics.range > HISTORY_SCROLL_MIN_RANGE_PX &&
    metrics.thumbRatio < HISTORY_SCROLL_MAX_THUMB_RATIO &&
    metrics.progress < HISTORY_SCROLL_MAX_PROGRESS &&
    metrics.distanceToBottom > HISTORY_SCROLL_MIN_DISTANCE_TO_BOTTOM_PX;
}

function getPrimaryScrollElement(domSelectors: SiteSelectors): HTMLElement | null {
  const candidates = collectScrollCandidates(domSelectors);
  let best: HTMLElement | null = null;
  let bestScore = -1;

  candidates.forEach((candidate) => {
    const metrics = getScrollMetrics(candidate);
    if (!metrics || !isUsableScrollContainer(candidate, metrics)) {return;}

    const score = metrics.range + candidate.clientHeight;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
}

function collectScrollCandidates(domSelectors: SiteSelectors): Set<HTMLElement> {
  const candidates = new Set<HTMLElement>();
  const scrollingElement = document.scrollingElement;
  if (scrollingElement instanceof HTMLElement) {
    candidates.add(scrollingElement);
  }

  const messages = Array.from(document.querySelectorAll<HTMLElement>(domSelectors.messageBlocks));
  addAncestorScrollCandidates(messages[0], candidates);
  addAncestorScrollCandidates(messages[messages.length - 1], candidates);
  addAncestorScrollCandidates(getInputAreaElement(domSelectors), candidates);

  return candidates;
}

function addAncestorScrollCandidates(
  element: HTMLElement | undefined | null,
  candidates: Set<HTMLElement>
): void {
  let current = element?.parentElement ?? null;
  while (current) {
    if (isScrollStyleCandidate(current)) {
      candidates.add(current);
    }
    current = current.parentElement;
  }
}

function isScrollStyleCandidate(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return false;
  }

  if (element === document.scrollingElement) {
    return true;
  }

  const style = window.getComputedStyle(element);
  return /auto|scroll|overlay/i.test(`${style.overflowY} ${style.overflow}`);
}

function isUsableScrollContainer(element: HTMLElement, metrics: ScrollMetrics): boolean {
  if (metrics.range <= 0) {return false;}
  if (element.clientHeight < MIN_SCROLL_CONTAINER_HEIGHT_PX) {return false;}
  return element === document.scrollingElement || isElementVisible(element);
}

function getScrollMetrics(element: HTMLElement): ScrollMetrics | null {
  const scrollHeight = element.scrollHeight;
  const clientHeight = element.clientHeight;
  if (scrollHeight <= 0 || clientHeight <= 0 || scrollHeight <= clientHeight) {
    return null;
  }

  const range = scrollHeight - clientHeight;
  const distanceToBottom = scrollHeight - element.scrollTop - clientHeight;

  return {
    distanceToBottom,
    progress: range > 0 ? element.scrollTop / range : 1,
    range,
    thumbRatio: clientHeight / scrollHeight,
  };
}
