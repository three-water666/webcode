import { BRANDING } from "@webcode/shared";
import { t } from "../modules/i18n";
import { subscribeAutoSendState, type AutoSendState } from "../modules/auto_send_state";
import { FloatingPanelDragController } from "./floating_panel_drag";
import { FollowUpComposer, type FollowUpComposerState } from "./follow_up_overlay";
import type { FollowUpQueue } from "./follow_up_queue";
import { observeLauncherWidth } from "./tool_activity_launcher";
import {
  type ToolActivityItem,
  type ToolActivitySnapshot,
  type ToolActivityTracker,
  type ToolActivityTurn,
} from "./tool_activity";
import { createOverlayView } from "./tool_activity_overlay_layout";
import {
  formatTurnTime,
  getActivityTurnEntries,
  getDeliveryText,
  getItemStatusText,
  getTurnIcon,
  getTurnSummary,
  getTurnTone,
  isTurnSettled,
  type ToolActivityTurnEntry,
} from "./tool_activity_overlay_view";
import { getToolProgressText, getWorkPanelStatus, type WorkPanelStatus } from "./work_panel_status";

const ELAPSED_UPDATE_INTERVAL_MS = 1000;

interface ItemStatusView { element: HTMLElement; item: ToolActivityItem }

/** Shared floating panel for current tool activity and next-turn follow-ups. */
export class ToolActivityOverlay {
  private readonly activityMount: HTMLDivElement;
  private autoSendState: AutoSendState | null = null;
  private currentEntry: ToolActivityTurnEntry | undefined;
  private currentTurnId: string | null = null;
  private dismissedTurnId: string | null = null;
  private readonly dragController: FloatingPanelDragController;
  private enabled = false;
  private expanded = false;
  private followUpState: FollowUpComposerState = { count: 0, sending: false };
  private readonly headerMount: HTMLDivElement;
  private readonly historyPanel: HTMLDivElement;
  private historyVisible = false;
  private readonly host: HTMLDivElement;
  private readonly launcher: HTMLButtonElement;
  private readonly launcherCount: HTMLSpanElement;
  private readonly launcherLabel: HTMLSpanElement;
  private readonly launcherMark: HTMLSpanElement;
  private latestSnapshot: ToolActivitySnapshot = { items: [], turns: [] };
  private readonly itemStatusViews: ItemStatusView[] = [];
  private readonly statusMount: HTMLDivElement;
  private readonly statusLabel: HTMLDivElement;
  private readonly statusHint: HTMLDivElement;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private workStatus: WorkPanelStatus | null = null;

  public constructor(private readonly tracker: ToolActivityTracker, followUpQueue: FollowUpQueue) {
    const view = createOverlayView();
    this.host = view.host;
    this.launcher = view.launcher;
    this.launcherCount = view.launcherCount;
    this.launcherLabel = view.launcherLabel;
    this.launcherMark = view.launcherMark;
    this.historyPanel = view.historyPanel;
    this.headerMount = view.headerMount;
    this.activityMount = view.activityMount;
    this.statusMount = view.statusMount;
    this.statusLabel = view.statusLabel;
    this.statusHint = view.statusHint;
    this.dragController = new FloatingPanelDragController(this.host);
    this.dragController.bindHandle(this.launcher, true);
    observeLauncherWidth(this.launcher, this.dragController.scheduleClamp);
    this.bindLauncher();
    const followUpComposer = new FollowUpComposer(followUpQueue,
      (state) => this.handleFollowUpState(state), this.dragController.scheduleClamp);
    view.panel.appendChild(followUpComposer.element);
    this.tracker.subscribe((snapshot) => this.render(snapshot));
    subscribeAutoSendState((state) => {
      this.autoSendState = state;
      this.updateTimedContent();
      this.syncVisibility(Boolean(this.currentEntry ?? this.workStatus));
      this.syncTicker();
    });
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {return;}
    this.enabled = enabled;
    if (!enabled) {this.expanded = false; this.historyVisible = false;}
    this.render(this.latestSnapshot);
  }

  private bindLauncher(): void {
    this.launcher.onclick = () => {
      if (!this.dragController.consumeDragClick()) {this.setExpanded(true);}
    };
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.render(this.latestSnapshot);
  }

  private handleFollowUpState(state: FollowUpComposerState): void {
    this.followUpState = state;
    this.render(this.latestSnapshot);
  }

  private render(snapshot: ToolActivitySnapshot): void {
    this.latestSnapshot = snapshot;
    const entries = getActivityTurnEntries(snapshot);
    const latestEntry = entries.at(-1);
    const isSameTurn = latestEntry?.turn.id === this.currentTurnId;
    const currentScrollTop = isSameTurn ? this.getCurrentScrollTop() : 0;
    const historyScrollTop = this.getHistoryScrollTop();
    if (latestEntry && !isSameTurn) {this.startTurn(latestEntry.turn.id);}
    if (!latestEntry) {this.currentTurnId = null; this.dismissedTurnId = null;}

    const currentEntry = latestEntry && latestEntry.turn.id !== this.dismissedTurnId
      ? latestEntry
      : undefined;
    this.currentEntry = currentEntry;
    const historyEntries = currentEntry ? entries.slice(0, -1) : entries;
    this.renderWorkStatus();
    this.renderCurrent(currentEntry, historyEntries.length);
    this.renderHistory(historyEntries, currentEntry?.turn.id);
    this.restoreCurrentScrollTop(currentScrollTop);
    this.restoreHistoryScrollTop(historyScrollTop);
    this.syncVisibility(Boolean(currentEntry ?? this.workStatus));
    this.syncTicker();
    this.dragController.scheduleClamp();
  }

  private renderCurrent(entry: ToolActivityTurnEntry | undefined, historyCount: number): void {
    this.host.className = this.expanded ? "work-panel-expanded" : "";
    this.launcher.setAttribute("aria-expanded", String(this.expanded));
    this.headerMount.replaceChildren(this.createCurrentHeader(entry, historyCount));
    this.itemStatusViews.length = 0;
    this.activityMount.replaceChildren(...(entry ? [createTurnList(entry, "list", this.itemStatusViews)]
      : [createTextLine("activity-empty", t("work_panel_idle"))]));
    this.updateLauncher(entry);
  }

  private renderWorkStatus(): void {
    this.workStatus = getWorkPanelStatus(this.currentEntry, this.autoSendState);
    this.statusMount.style.display = this.workStatus ? "block" : "none";
    this.statusMount.className = `footer work-status ${this.workStatus?.tone ?? "active"}`;
    setText(this.statusLabel, this.workStatus?.text ?? "");
    setText(this.statusHint, this.workStatus?.hint ?? "");
    const closeButton = this.headerMount.querySelector<HTMLButtonElement>(".close");
    if (closeButton) {
      closeButton.disabled = this.workStatus?.busy === true || !this.currentEntry || !isTurnSettled(this.currentEntry.turn);
    }
  }

  private updateTimedContent(): void {
    this.itemStatusViews.forEach(({ element, item }) => setText(element, getItemStatusText(item)));
    this.renderWorkStatus();
    this.updateLauncher(this.currentEntry);
  }

  private renderHistory(entries: ToolActivityTurnEntry[], currentTurnId?: string): void {
    const shouldShow = this.expanded && this.historyVisible;
    this.host.setAttribute("data-history-visible", String(shouldShow));
    this.historyPanel.style.display = shouldShow ? "flex" : "none";
    if (!shouldShow) {return;}

    const header = document.createElement("div");
    header.className = "history-header drag-header";
    header.title = t("work_panel_drag");
    this.dragController.bindHandle(header);
    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = `${t("activity_history")} · ${entries.length}`;
    const actions = document.createElement("div");
    actions.className = "history-actions";
    actions.append(this.createHistoryClearButton(entries.length, currentTurnId), this.createHistoryCloseButton());
    header.append(title, actions);

    const list = document.createElement("div");
    list.className = "history-list";
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "history-empty"; empty.textContent = t("activity_no_history");
      list.appendChild(empty);
    } else {
      entries.forEach((entry) => list.appendChild(createHistoryTurn(entry)));
    }
    this.historyPanel.replaceChildren(header, list);
  }

  private createCurrentHeader(
    entry: ToolActivityTurnEntry | undefined, historyCount: number
  ): HTMLElement {
    const header = document.createElement("div");
    header.className = "header drag-header";
    header.title = t("work_panel_drag");
    this.dragController.bindHandle(header);

    const identity = document.createElement("div");
    identity.className = "identity";
    const heading = document.createElement("div");
    heading.className = "heading";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${BRANDING.productName} · ${t("work_panel_title")}`;
    const summary = document.createElement("div");
    summary.className = "summary";
    summary.textContent = entry ? getToolProgressText(entry.items) : "";
    heading.append(title, summary);
    identity.append(createIdleMark(), heading);

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(this.createHistoryButton(historyCount), this.createCollapseButton(),
      this.createCloseButton(entry));
    header.append(identity, actions);
    return header;
  }

  private createHistoryButton(historyCount: number): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = this.historyVisible ? "history-button active" : "history-button";
    button.title = t(this.historyVisible ? "activity_hide_history" : "activity_show_history");
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(this.historyVisible));
    button.textContent = `${t("activity_history")} (${historyCount})`;
    button.onclick = () => {
      this.historyVisible = !this.historyVisible;
      this.render(this.latestSnapshot);
    };
    return button;
  }

  private createHistoryCloseButton(): HTMLButtonElement {
    const button = createIconButton("×", t("activity_hide_history"), "icon-button close");
    button.onclick = () => {this.historyVisible = false; this.render(this.latestSnapshot);};
    return button;
  }

  private createHistoryClearButton(historyCount: number, currentTurnId?: string): HTMLButtonElement {
    const button = createIconButton(t("activity_clear"), t("activity_clear_history"),
      "history-clear-button");
    button.disabled = historyCount === 0;
    button.onclick = button.disabled ? null : () => this.tracker.clearHistory(currentTurnId);
    return button;
  }

  private createCollapseButton(): HTMLButtonElement {
    const button = createIconButton("−", t("activity_minimize"), "icon-button collapse");
    button.onclick = () => this.setExpanded(false);
    return button;
  }

  private createCloseButton(entry: ToolActivityTurnEntry | undefined): HTMLButtonElement {
    const button = createIconButton("×", t("activity_close"), "icon-button close");
    const turnId = entry && isTurnSettled(entry.turn) ? entry.turn.id : null;
    button.disabled = turnId === null || this.workStatus?.busy === true;
    button.onclick = turnId === null ? null : () => {
      this.dismissedTurnId = turnId;
      this.render(this.latestSnapshot);
    };
    return button;
  }

  private updateLauncher(entry: ToolActivityTurnEntry | undefined): void {
    this.launcherMark.className = `launcher-mark ${this.workStatus?.tone ?? "idle"}`;
    setText(this.launcherMark, this.workStatus?.icon ?? "▤");
    this.launcher.className = this.workStatus ? "launcher has-activity" : "launcher";
    setText(this.launcherLabel, this.workStatus?.text ?? `${BRANDING.productName} · ${t("work_panel_title")}`);
    this.launcherLabel.title = entry ? getToolProgressText(entry.items) : "";
    this.launcherCount.textContent = t("follow_up_count").replace("{count}", String(this.followUpState.count));
    this.launcherCount.title = t(this.followUpState.sending ? "follow_up_sending" : "follow_up_waiting");
    this.launcherCount.style.display = this.followUpState.count > 0 ? "inline-flex" : "none";
    this.launcher.setAttribute("aria-label", [t("work_panel_open"), this.launcherLabel.textContent,
      this.followUpState.count > 0 ? `${this.launcherCount.textContent} · ${this.launcherCount.title}` : ""
    ].filter(Boolean).join(" · "));
  }

  private startTurn(turnId: string): void {
    this.currentTurnId = turnId;
    this.dismissedTurnId = null;
  }

  private syncVisibility(hasCurrentActivity: boolean): void {
    this.host.style.display = this.enabled || hasCurrentActivity ? "block" : "none";
  }

  private syncTicker(): void {
    const shouldRun = this.workStatus?.countingDown === true ||
      this.itemStatusViews.some(({ item }) => item.status === "executing");
    if (shouldRun && !this.ticker) {
      this.ticker = setInterval(() => this.updateTimedContent(), ELAPSED_UPDATE_INTERVAL_MS);
    } else if (!shouldRun && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private getCurrentScrollTop(): number {
    return this.activityMount.querySelector<HTMLElement>(".list")?.scrollTop ?? 0;
  }

  private getHistoryScrollTop(): number {
    if (!this.historyVisible) {return 0;}
    return this.historyPanel.querySelector<HTMLElement>(".history-list")?.scrollTop ?? 0;
  }

  private restoreCurrentScrollTop(scrollTop: number): void {
    const list = this.activityMount.querySelector<HTMLElement>(".list");
    if (list) {list.scrollTop = scrollTop;}
  }

  private restoreHistoryScrollTop(scrollTop: number): void {
    if (!this.historyVisible) {return;}
    const history = this.historyPanel.querySelector<HTMLElement>(".history-list");
    if (history) {history.scrollTop = scrollTop;}
  }
}

function createHistoryTurn(entry: ToolActivityTurnEntry): HTMLElement {
  const turn = document.createElement("section");
  turn.className = "history-turn";
  const header = document.createElement("div");
  header.className = "history-turn-header";
  const heading = document.createElement("div");
  heading.className = "turn-heading";
  const time = document.createElement("div");
  time.className = "turn-name";
  time.textContent = formatTurnTime(entry.turn.createdAt);
  const summary = document.createElement("div");
  summary.className = "turn-meta";
  summary.textContent = getTurnSummary(entry.turn, entry.items);
  heading.append(time, summary);
  header.append(createTurnMark(entry.turn, entry.items), heading);
  turn.append(header, ...createTurnDetails(entry, "history-tool-list"));
  return turn;
}

function createTurnMark(turn: ToolActivityTurn, items: ToolActivityItem[]): HTMLElement {
  return createMark(`mark ${getTurnTone(turn, items)}`, getTurnIcon(turn, items));
}

function createMark(className: string, text: string): HTMLElement {
  const mark = document.createElement("span");
  mark.className = className;
  mark.textContent = text;
  return mark;
}

function createIdleMark(): HTMLElement {
  return createMark("mark idle", "▤");
}

function createTurnDetails(entry: ToolActivityTurnEntry, listClassName: string): HTMLElement[] {
  const list = createTurnList(entry, listClassName);
  const footer = document.createElement("div");
  footer.className = `footer ${getTurnTone(entry.turn, entry.items)}`;
  footer.textContent = getDeliveryText(entry.turn, entry.items);
  return [list, footer];
}

function createTurnList(entry: ToolActivityTurnEntry, className: string, statusViews?: ItemStatusView[]): HTMLElement {
  const list = document.createElement("div");
  list.className = className;
  entry.items.forEach((item) => list.appendChild(createActivityRow(item, statusViews)));
  return list;
}

function createActivityRow(item: ToolActivityItem, statusViews?: ItemStatusView[]): HTMLElement {
  const row = document.createElement("div");
  row.className = `row ${item.status}`;
  const dot = document.createElement("span");
  dot.className = "status-dot";
  const content = document.createElement("div");
  content.className = "row-content";
  const top = document.createElement("div");
  top.className = "row-top";
  const name = document.createElement("span");
  name.className = "tool-name";
  name.textContent = item.toolName;
  const source = document.createElement("span");
  source.className = `source-badge ${item.source}`;
  source.textContent = t(item.source === "network" ? "activity_source_network" : "activity_source_dom");
  const identity = document.createElement("div");
  identity.className = "tool-identity";
  identity.append(name, source);
  const status = document.createElement("span");
  status.className = "status";
  status.textContent = getItemStatusText(item);
  statusViews?.push({ element: status, item });
  top.append(identity, status);
  content.appendChild(top);
  if (item.purpose) {content.appendChild(createTextLine("purpose", item.purpose));}
  if (item.detail) {content.appendChild(createTextLine("detail", item.detail));}
  if (item.message && (item.status === "failed" || item.status === "rejected")) {
    content.appendChild(createTextLine("message", item.message));
  }
  row.append(dot, content);
  return row;
}

function createTextLine(className: string, value: string): HTMLElement {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = value;
  line.title = value;
  return line;
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {element.textContent = text;}
}

function createIconButton(text: string, title: string, className = "icon-button"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.textContent = text;
  return button;
}
