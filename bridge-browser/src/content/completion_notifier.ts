import { BRANDING } from "@webcode/shared";
import { Logger } from "../modules/logger";
import { showUserAttentionNotification } from "../modules/user_attention";
import { type PageTurnCompletionEvent } from "./page_turn_state";

const COMPLETION_NOTIFICATION_COOLDOWN_MS = 1000;
const MAX_NOTIFIED_COMPLETION_KEYS = 200;

export class CompletionNotifier {
  private lastNotificationTime = 0;
  private readonly notifiedCompletionKeys = new Set<string>();

  public reset(): void {
    this.lastNotificationTime = 0;
    this.notifiedCompletionKeys.clear();
  }

  public notify(event: PageTurnCompletionEvent | null): void {
    if (!event) {
      return;
    }

    const completionKey = `${event.turnId}:${event.responseSignature}`;
    if (this.notifiedCompletionKeys.has(completionKey)) {
      return;
    }

    const now = Date.now();
    if (now - this.lastNotificationTime < COMPLETION_NOTIFICATION_COOLDOWN_MS) {
      return;
    }

    this.notifiedCompletionKeys.add(completionKey);
    this.lastNotificationTime = now;
    this.trimNotifiedCompletionKeys();

    void requestCompletionAttention().then((result) => {
      if (result === "sent") {
        Logger.log("Completion attention requested", "action");
      } else if (result === "failed") {
        Logger.log("Completion attention request failed", "info");
      }
    });
  }

  private trimNotifiedCompletionKeys(): void {
    if (this.notifiedCompletionKeys.size <= MAX_NOTIFIED_COMPLETION_KEYS) {
      return;
    }

    const oldestKey = this.notifiedCompletionKeys.values().next().value;
    if (typeof oldestKey === "string") {
      this.notifiedCompletionKeys.delete(oldestKey);
    }
  }
}

function requestCompletionAttention(): Promise<"sent" | "skipped" | "failed"> {
  return showUserAttentionNotification({
    title: BRANDING.notificationName,
    message: "Task Completed",
    onlyWhenWindowInBackground: true,
  });
}
