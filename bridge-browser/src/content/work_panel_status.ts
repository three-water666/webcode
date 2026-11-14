import type { AutoSendState } from "../modules/auto_send_state";
import { t } from "../modules/i18n";
import type { ToolActivityItem } from "./tool_activity";
import {
  getAutoSendStatusText, getDeliveryText, getTurnIcon, getTurnTone, isTurnSettled,
  type ToolActivityTone, type ToolActivityTurnEntry,
} from "./tool_activity_overlay_view";

export interface WorkPanelStatus {
  busy: boolean;
  countingDown: boolean;
  hint: string;
  icon: string;
  text: string;
  tone: ToolActivityTone;
}

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "rejected"]);

export function getToolProgressText(items: ToolActivityItem[]): string {
  const completed = items.filter((item) => TERMINAL_STATUSES.has(item.status)).length;
  return t("work_panel_tool_progress").replace("{completed}", String(completed)).replace("{total}", String(items.length));
}

export function getWorkPanelStatus(
  entry: ToolActivityTurnEntry | undefined,
  autoSendState: AutoSendState | null
): WorkPanelStatus | null {
  if (autoSendState && matchesCurrentWork(entry, autoSendState) &&
    !(entry?.turn.deliveryStatus === "failed" && autoSendState.requestKeys?.length)) {
    return getSendStatus(autoSendState);
  }
  return entry ? getToolStatus(entry) : null;
}

function matchesCurrentWork(entry: ToolActivityTurnEntry | undefined, state: AutoSendState): boolean {
  if (!state.requestKeys?.length) {return !entry || isTurnSettled(entry.turn);}
  const latestItem = entry?.items.at(-1);
  return Boolean(latestItem && state.requestKeys.includes(latestItem.requestKey)) &&
    !entry?.items.some((item) => !TERMINAL_STATUSES.has(item.status));
}

function getToolStatus(entry: ToolActivityTurnEntry): WorkPanelStatus {
  const { turn, items } = entry;
  let text = getDeliveryText(turn, items);
  if (turn.deliveryStatus === "pending" || turn.deliveryStatus === "waiting") {
    text = getProcessingText(items);
  }
  return {
    busy: !isTurnSettled(turn), countingDown: false, hint: "", icon: getTurnIcon(turn, items),
    text, tone: getTurnTone(turn, items),
  };
}

function getProcessingText(items: ToolActivityItem[]): string {
  if (items.some((item) => item.status === "awaiting_approval")) {return t("activity_awaiting_approval");}
  return t(items.every((item) => TERMINAL_STATUSES.has(item.status))
    ? "activity_delivering" : "work_panel_processing");
}

function getSendStatus(state: AutoSendState): WorkPanelStatus {
  const busy = state.phase === "waiting" || state.phase === "sending" || state.phase === "preparing";
  const tone = busy ? "active" : state.phase === "failed" ? "error" : state.phase === "sent" ? "success" : "warn";
  const hint = state.phase === "waiting" ? t("auto_send_cancel_hint")
    : state.phase === "disabled" || state.phase === "cancelled" || state.phase === "failed" ? t("auto_send_manual_hint") : "";
  return {
    busy, countingDown: state.phase === "waiting", hint,
    icon: busy ? "●" : state.phase === "sent" ? "✓" : "!", text: getAutoSendStatusText(state), tone,
  };
}
