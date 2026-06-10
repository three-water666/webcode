import { type SiteSelectors } from "../modules/config";
import * as UI from "../modules/ui";

interface SendIntentObserverOptions {
  getSelectors: () => SiteSelectors | null;
  isClientConnected: () => boolean;
  onSubmit: () => void;
}

export class SendIntentObserver {
  private listenerStarted = false;

  public constructor(private readonly options: SendIntentObserverOptions) {}

  public start(): void {
    if (this.listenerStarted) {return;}
    this.listenerStarted = true;

    document.addEventListener("keydown", (event) => this.handleKeyDown(event), true);
    document.addEventListener("click", (event) => this.handleClick(event), true);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const selectors = this.options.getSelectors();
    if (!selectors || !this.options.isClientConnected() || !isEnterSendIntent(event)) {return;}
    if (!isEventFromInputArea(event, selectors)) {return;}

    this.options.onSubmit();
  }

  private handleClick(event: MouseEvent): void {
    const selectors = this.options.getSelectors();
    if (!selectors || !this.options.isClientConnected() || !isPrimaryClick(event)) {return;}
    if (!isSendButtonEvent(event, selectors)) {return;}

    this.options.onSubmit();
  }
}

function isEnterSendIntent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) {return false;}
  if (event.key !== "Enter") {return false;}
  if (event.isComposing) {return false;}
  return !event.shiftKey && !event.altKey && !event.metaKey;
}

function isPrimaryClick(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0;
}

function isEventFromInputArea(event: Event, selectors: SiteSelectors): boolean {
  const target = event.target;
  if (target instanceof Element && matchesClosest(target, selectors.inputArea)) {
    return true;
  }

  const activeEl = document.activeElement;
  return UI.getInputAreaCandidates(selectors).some((inputEl) => (
    activeEl === inputEl || Boolean(activeEl) && inputEl.contains(activeEl)
  ));
}

function isSendButtonEvent(event: MouseEvent, selectors: SiteSelectors): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {return false;}
  if (selectors.stopButton && matchesClosest(target, selectors.stopButton)) {return false;}

  return matchesClosest(target, selectors.sendButton);
}

function matchesClosest(target: Element, selector: string): boolean {
  try {
    return Boolean(target.closest(selector));
  } catch {
    return false;
  }
}
