import { type SiteSelectors } from "../modules/config";
import {
  getLatestResponseSnapshot,
  isStopButtonVisible,
  type LatestResponseSnapshot,
} from "../modules/page_selectors";

export type PageTurnStatus =
  | "idle"
  | "submitted"
  | "generating"
  | "capturing_tools"
  | "waiting_tool_results"
  | "settling";

export type PageTurnSubmitSource = "user" | "auto-send";

export interface PageTurnCompletionEvent {
  responseSignature: string;
  responseTextLength: number;
  source: PageTurnSubmitSource;
  turnId: number;
}

export interface PageTurnObservation {
  nextCheckDelayMs: number | null;
  status: PageTurnStatus;
}

interface TurnBaseline {
  messageIndex: number;
  signature: string;
}

interface ActiveTurn {
  activeResponseElement: Element | null;
  baseline: TurnBaseline | null;
  hadToolCapture: boolean;
  settleDeadline: number | null;
  source: PageTurnSubmitSource;
  submittedAt: number;
  turnId: number;
}

const RESPONSE_SETTLE_MS = 600;
const SUBMITTED_TIMEOUT_MS = 5 * 60 * 1000;
const BOTTOM_THRESHOLD_PX = 240;
const MIN_SCROLL_RANGE_PX = 80;

export class PageTurnStateMachine {
  private status: PageTurnStatus = "idle";
  private turnCounter = 0;
  private activeTurn: ActiveTurn | null = null;
  private lastObservedUrl = location.href;
  private latestResponseSnapshot: LatestResponseSnapshot | null = null;
  private latestViewNearBottom = true;
  private pendingCompletionEvent: PageTurnCompletionEvent | null = null;

  public reset(): void {
    this.status = "idle";
    this.activeTurn = null;
    this.latestResponseSnapshot = null;
    this.latestViewNearBottom = true;
    this.pendingCompletionEvent = null;
    this.lastObservedUrl = location.href;
  }

  public markSubmitted(
    selectors: SiteSelectors,
    source: PageTurnSubmitSource,
    now = Date.now()
  ): void {
    const latestSnapshot = getLatestResponseSnapshot(selectors);
    this.turnCounter++;
    this.status = "submitted";
    this.activeTurn = {
      activeResponseElement: null,
      baseline: latestSnapshot
        ? {
          messageIndex: latestSnapshot.messageIndex,
          signature: latestSnapshot.signature,
        }
        : null,
      hadToolCapture: false,
      settleDeadline: null,
      source,
      submittedAt: now,
      turnId: this.turnCounter,
    };
    this.latestResponseSnapshot = latestSnapshot;
    this.latestViewNearBottom = isPrimaryScrollNearBottom();
    this.pendingCompletionEvent = null;
    this.lastObservedUrl = location.href;
  }

  public observe(selectors: SiteSelectors, now = Date.now()): PageTurnObservation {
    if (location.href !== this.lastObservedUrl) {
      this.reset();
      this.lastObservedUrl = location.href;
    }

    const stopVisible = isStopButtonVisible(selectors);
    const latestSnapshot = getLatestResponseSnapshot(selectors);
    this.latestResponseSnapshot = latestSnapshot;
    this.latestViewNearBottom = isPrimaryScrollNearBottom();

    if (!this.activeTurn) {
      return this.getObservation();
    }

    if (now - this.activeTurn.submittedAt > SUBMITTED_TIMEOUT_MS) {
      this.reset();
      return this.getObservation();
    }

    if (stopVisible) {
      this.status = this.activeTurn.hadToolCapture ? "capturing_tools" : "generating";
      this.activeTurn.settleDeadline = null;
      this.lockLatestResponseIfEligible(latestSnapshot);
    } else {
      this.lockLatestResponseIfEligible(latestSnapshot);
      if (!this.activeTurn.activeResponseElement) {
        return this.getObservation();
      }
      this.updateSettlingState(now);
    }

    return this.getObservation();
  }

  public canStartToolCapture(messageElement: Element): boolean {
    if (!this.activeTurn || !this.isCaptureStatus()) {
      return false;
    }

    return this.activeTurn.activeResponseElement === messageElement;
  }

  public noteToolCaptureStarted(): void {
    if (!this.activeTurn) {return;}

    this.activeTurn.hadToolCapture = true;
    if (this.status !== "waiting_tool_results") {
      this.status = "capturing_tools";
    }
  }

  public noteToolResultsPending(): void {
    if (!this.activeTurn) {return;}

    this.activeTurn.hadToolCapture = true;
    this.status = "waiting_tool_results";
    this.activeTurn.settleDeadline = null;
  }

  public noteToolResultsDelivered(): void {
    if (!this.activeTurn) {return;}

    this.status = "idle";
    this.activeTurn = null;
  }

  public consumeCompletionEvent(): PageTurnCompletionEvent | null {
    const event = this.pendingCompletionEvent;
    this.pendingCompletionEvent = null;
    return event;
  }

  private updateSettlingState(now: number): void {
    if (!this.activeTurn) {return;}

    if (this.status === "waiting_tool_results") {
      return;
    }

    if (this.status !== "settling") {
      this.status = "settling";
      this.activeTurn.settleDeadline = now + RESPONSE_SETTLE_MS;
      return;
    }

    const settleDeadline = this.activeTurn.settleDeadline;
    if (settleDeadline === null || now < settleDeadline) {
      return;
    }

    this.finishSettledTurn();
  }

  private finishSettledTurn(): void {
    const activeTurn = this.activeTurn;
    if (!activeTurn) {return;}

    const activeSnapshot = this.getActiveResponseSnapshot();
    if (
      activeSnapshot &&
      activeSnapshot.text.length > 0 &&
      !activeTurn.hadToolCapture
    ) {
      this.pendingCompletionEvent = {
        responseSignature: activeSnapshot.signature,
        responseTextLength: activeSnapshot.text.length,
        source: activeTurn.source,
        turnId: activeTurn.turnId,
      };
    }

    this.status = "idle";
    this.activeTurn = null;
  }

  private lockLatestResponseIfEligible(snapshot: LatestResponseSnapshot | null): void {
    if (!this.activeTurn || !snapshot || snapshot.text.length === 0) {
      return;
    }

    if (this.activeTurn.activeResponseElement) {
      if (
        this.activeTurn.activeResponseElement !== snapshot.messageElement &&
        this.latestViewNearBottom &&
        this.hasAdvancedFromBaseline(snapshot)
      ) {
        this.activeTurn.activeResponseElement = snapshot.messageElement;
      }
      return;
    }

    if (!this.latestViewNearBottom || !this.hasAdvancedFromBaseline(snapshot)) {
      return;
    }

    this.activeTurn.activeResponseElement = snapshot.messageElement;
    if (this.status === "submitted") {
      this.status = "generating";
    }
  }

  private getActiveResponseSnapshot(): LatestResponseSnapshot | null {
    const snapshot = this.latestResponseSnapshot;
    if (
      snapshot &&
      this.activeTurn?.activeResponseElement === snapshot.messageElement
    ) {
      return snapshot;
    }

    return null;
  }

  private hasAdvancedFromBaseline(snapshot: LatestResponseSnapshot): boolean {
    const baseline = this.activeTurn?.baseline;
    if (!baseline) {
      return true;
    }

    return snapshot.messageIndex > baseline.messageIndex ||
      snapshot.signature !== baseline.signature;
  }

  private isCaptureStatus(): boolean {
    return this.status === "generating" ||
      this.status === "capturing_tools" ||
      this.status === "waiting_tool_results" ||
      this.status === "settling";
  }

  private getObservation(): PageTurnObservation {
    const nextCheckDelayMs = this.status === "settling" && this.activeTurn?.settleDeadline
      ? Math.max(0, this.activeTurn.settleDeadline - Date.now())
      : null;

    return {
      nextCheckDelayMs,
      status: this.status,
    };
  }
}

function isPrimaryScrollNearBottom(): boolean {
  const scrollElement = getPrimaryScrollElement();
  if (!scrollElement) {
    return true;
  }

  return scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop <= BOTTOM_THRESHOLD_PX;
}

function getPrimaryScrollElement(): Element | null {
  const documentScroller = document.scrollingElement ?? document.documentElement;
  const scrollableElements = Array.from(document.querySelectorAll<HTMLElement>("*"))
    .filter(isScrollableElement)
    .sort((left, right) => getVisibleArea(right) - getVisibleArea(left));

  return scrollableElements[0] ?? documentScroller;
}

function isScrollableElement(element: HTMLElement): boolean {
  if (element.scrollHeight - element.clientHeight <= MIN_SCROLL_RANGE_PX) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (!/(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 240 && rect.height > 160;
}

function getVisibleArea(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  return width * height;
}
