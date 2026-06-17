import { Logger } from "../modules/logger";

const VIRTUALIZED_HISTORY_SKIP_LOG_INTERVAL_MS = 3000;

let lastVirtualizedHistorySkipLogTime = 0;

export function logVirtualizedHistorySkip(toolName?: string): void {
  const now = Date.now();
  if (now - lastVirtualizedHistorySkipLogTime <= VIRTUALIZED_HISTORY_SKIP_LOG_INTERVAL_MS) {return;}

  lastVirtualizedHistorySkipLogTime = now;
  Logger.log(`Skipped virtualized history tool call${toolName ? `: ${toolName}` : ""}`, "warn");
}
