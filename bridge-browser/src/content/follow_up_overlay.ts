import { t } from "../modules/i18n";
import { type FollowUpItem, type FollowUpQueue, type FollowUpQueueSnapshot } from "./follow_up_queue";

export interface FollowUpComposerState {
  count: number;
  sending: boolean;
}

type FollowUpStateListener = (state: FollowUpComposerState) => void;

/** Stable follow-up composer embedded in the shared work panel. */
export class FollowUpComposer {
  private readonly body: HTMLDivElement;
  private readonly chevron: HTMLSpanElement;
  private readonly confirmButton: HTMLButtonElement;
  public readonly element: HTMLElement;
  private expanded = false;
  private readonly onStateChange: FollowUpStateListener;
  private readonly queueElement: HTMLDivElement;
  private readonly queue: FollowUpQueue;
  private state: FollowUpComposerState = { count: 0, sending: false };
  private readonly summary: HTMLSpanElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly toggle: HTMLButtonElement;

  public constructor(
    queue: FollowUpQueue,
    onStateChange: FollowUpStateListener,
    private readonly onLayoutChange: () => void = () => undefined
  ) {
    this.queue = queue;
    this.onStateChange = onStateChange;
    const view = createComposerView();
    this.body = view.body;
    this.chevron = view.chevron;
    this.element = view.element;
    this.queueElement = view.queueElement;
    this.summary = view.summary;
    this.textarea = view.textarea;
    this.confirmButton = view.confirmButton;
    this.toggle = view.toggle;
    this.bindComposer();
    queue.subscribe((snapshot) => this.renderQueue(snapshot));
  }

  private toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.body.style.display = this.expanded ? "flex" : "none";
    this.toggle.setAttribute("aria-expanded", String(this.expanded));
    this.toggle.title = t(this.expanded ? "follow_up_collapse" : "follow_up_open");
    this.chevron.textContent = this.expanded ? "▾" : "▸";
    this.onLayoutChange();
    if (this.expanded) {this.textarea.focus();} else {this.toggle.focus();}
  }

  private bindComposer(): void {
    this.toggle.onclick = () => this.toggleExpanded();
    this.confirmButton.onclick = () => this.confirmDraft();
    this.textarea.addEventListener("input", () => this.syncConfirmButton());
    this.textarea.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
        event.preventDefault();
        this.confirmDraft();
      }
    });
    this.textarea.addEventListener("keypress", (event) => event.stopPropagation());
    this.textarea.addEventListener("keyup", (event) => event.stopPropagation());
    this.syncConfirmButton();
  }

  private confirmDraft(): void {
    if (!this.queue.confirm(this.textarea.value)) {return;}
    this.textarea.value = "";
    this.syncConfirmButton();
    this.textarea.focus();
  }

  private renderQueue(snapshot: FollowUpQueueSnapshot): void {
    this.queueElement.replaceChildren(...snapshot.items.map((item) => this.createQueueItem(item)));
    const sending = snapshot.items.some((item) => item.status === "sending");
    this.state = { count: snapshot.items.length, sending };
    this.syncSummary();
    const count = this.element.querySelector<HTMLElement>(".follow-up-count");
    if (count) {
      count.textContent = String(snapshot.items.length);
      count.style.display = snapshot.items.length > 0 ? "inline-flex" : "none";
    }
    this.onStateChange(this.state);
  }

  private createQueueItem(item: FollowUpItem): HTMLElement {
    const row = document.createElement("div");
    row.className = `follow-up-item ${item.status}`;
    const text = document.createElement("div");
    text.className = "follow-up-item-text";
    text.textContent = item.text;
    const actions = document.createElement("div");
    actions.className = "follow-up-item-actions";
    row.append(text, actions);

    const state = document.createElement("span");
    state.className = item.status === "sending"
      ? "follow-up-item-state"
      : "follow-up-item-state waiting";
    state.textContent = t(item.status === "sending" ? "follow_up_sending_short" : "follow_up_waiting_short");
    actions.appendChild(state);
    if (item.status === "confirmed") {
      actions.appendChild(this.createRemoveButton(item.id));
    }
    return row;
  }

  private createRemoveButton(itemId: string): HTMLButtonElement {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "follow-up-remove";
    remove.title = t("follow_up_remove");
    remove.setAttribute("aria-label", remove.title);
    remove.textContent = "×";
    remove.onclick = () => this.queue.remove(itemId);
    return remove;
  }

  private syncConfirmButton(): void {
    this.confirmButton.disabled = this.textarea.value.trim().length === 0;
    this.syncSummary();
  }

  private syncSummary(): void {
    const status = this.state.sending ? t("follow_up_sending_short")
      : this.state.count > 0 ? t("follow_up_waiting_short") : "";
    const draft = this.textarea.value.trim() ? t("follow_up_draft") : "";
    this.summary.textContent = [status, draft].filter(Boolean).join(" · ");
    this.summary.title = this.summary.textContent;
  }
}

function createComposerView(): {
  body: HTMLDivElement;
  chevron: HTMLSpanElement;
  confirmButton: HTMLButtonElement;
  element: HTMLElement;
  queueElement: HTMLDivElement;
  summary: HTMLSpanElement;
  textarea: HTMLTextAreaElement;
  toggle: HTMLButtonElement;
} {
  const element = document.createElement("section");
  element.className = "follow-up-section";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "follow-up-toggle";
  toggle.title = t("follow_up_open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "follow-up-body");
  const title = document.createElement("span");
  title.className = "follow-up-title";
  title.textContent = t("follow_up_title");
  const summary = document.createElement("span");
  summary.className = "follow-up-summary";
  const count = document.createElement("span");
  count.className = "follow-up-count";
  count.style.display = "none";
  const chevron = document.createElement("span");
  chevron.className = "follow-up-chevron";
  chevron.textContent = "▸";
  chevron.setAttribute("aria-hidden", "true");
  toggle.append(title, count, summary, chevron);

  const body = document.createElement("div");
  body.id = "follow-up-body";
  body.className = "follow-up-body";
  body.style.display = "none";
  const description = document.createElement("div");
  description.className = "follow-up-description";
  description.textContent = t("follow_up_description");
  const queueElement = document.createElement("div");
  queueElement.className = "follow-up-queue";
  const { composer, confirmButton, textarea } = createInputView();
  body.append(description, queueElement, composer);
  element.append(toggle, body);
  return { body, chevron, confirmButton, element, queueElement, summary, textarea, toggle };
}

function createInputView(): {
  composer: HTMLDivElement;
  confirmButton: HTMLButtonElement;
  textarea: HTMLTextAreaElement;
} {
  const composer = document.createElement("div");
  composer.className = "follow-up-composer";
  const textarea = document.createElement("textarea");
  textarea.placeholder = t("follow_up_placeholder");
  textarea.setAttribute("aria-label", t("follow_up_title"));
  const footer = document.createElement("div");
  footer.className = "follow-up-composer-footer";
  const hint = document.createElement("span");
  hint.className = "follow-up-hint";
  hint.textContent = t("follow_up_shortcut");
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "follow-up-confirm";
  confirmButton.textContent = t("follow_up_confirm");
  footer.append(hint, confirmButton);
  composer.append(textarea, footer);
  return { composer, confirmButton, textarea };
}
