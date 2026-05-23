import { BRANDING } from "@webcode/shared";
import { type SiteSelectors } from "../modules/config";
import { isElementVisible } from "../modules/dom_helpers";
import { i18n } from "../modules/i18n";
import { Logger } from "../modules/logger";
import {
  getSendButton,
  isSendButtonActuallyStopButton,
  isStopButtonVisible,
} from "../modules/page_selectors";
import { looksLikeToolCall } from "../modules/toolCallProtocol";

interface LatestResponseSnapshot {
  signature: string;
  hasContent: boolean;
  hasToolCall: boolean;
}

const NO_RESPONSE_SIGNATURE = "no-response";

export class CompletionNotifier {
  private lastSendReady: boolean | null = null;
  private pendingStartSignature: string | null = null;
  private readonly notifiedCompletionKeys = new Set<string>();

  public reset(): void {
    this.lastSendReady = null;
    this.pendingStartSignature = null;
  }

  public observe(domSelectors: SiteSelectors): void {
    const sendReady = isCompletionSendButtonVisible(domSelectors);
    if (this.lastSendReady === null) {
      this.lastSendReady = sendReady;
      return;
    }

    if (this.lastSendReady && !sendReady) {
      this.pendingStartSignature = getLatestResponseSnapshot(domSelectors)?.signature ?? NO_RESPONSE_SIGNATURE;
    }

    if (!this.lastSendReady && sendReady) {
      this.notifyIfCurrentTurnCompletedWithoutTools(domSelectors);
    }

    this.lastSendReady = sendReady;
  }

  private notifyIfCurrentTurnCompletedWithoutTools(domSelectors: SiteSelectors): void {
    const startSignature = this.pendingStartSignature;
    this.pendingStartSignature = null;
    if (startSignature === null) {
      return;
    }

    const snapshot = getLatestResponseSnapshot(domSelectors);
    if (!snapshot || !snapshot.hasContent || snapshot.hasToolCall) {
      return;
    }

    if (snapshot.signature === startSignature) {
      return;
    }

    const completionKey = `${startSignature}->${snapshot.signature}`;
    if (this.notifiedCompletionKeys.has(completionKey)) {
      return;
    }

    this.notifiedCompletionKeys.add(completionKey);
    void sendCompletionNotification().then((result) => {
      if (result === "sent") {
        Logger.log("Completion notification sent", "action");
      } else if (result === "failed") {
        Logger.log("Completion notification failed", "info");
      }
    });
  }
}

function isCompletionSendButtonVisible(domSelectors: SiteSelectors): boolean {
  const sendButton = getSendButton(domSelectors);
  if (!sendButton) {
    return false;
  }

  if (isStopButtonVisible(domSelectors) || isSendButtonActuallyStopButton(domSelectors, sendButton)) {
    return false;
  }

  return isElementVisible(sendButton);
}

function getLatestResponseSnapshot(domSelectors: SiteSelectors): LatestResponseSnapshot | null {
  const messages = document.querySelectorAll(domSelectors.messageBlocks);
  if (messages.length === 0) {
    return null;
  }

  const messageIndex = messages.length - 1;
  const messageElement = messages[messageIndex];
  const text = (messageElement.textContent ?? "").trim();
  const codeElements = Array.from(messageElement.querySelectorAll(domSelectors.codeBlocks));

  return {
    signature: `${messageIndex}:${hashStableString(text)}`,
    hasContent: text.length > 0,
    hasToolCall: codeElements.some((codeEl) => looksLikeToolCall((codeEl.textContent ?? "").trim())),
  };
}

function sendCompletionNotification(): Promise<"sent" | "skipped" | "failed"> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: "SHOW_NOTIFICATION",
          title: `${BRANDING.productName} Task Finished`,
          message: getCompletionNotificationMessage(),
          onlyWhenWindowInBackground: true,
        },
        (response: unknown) => {
          if (chrome.runtime.lastError) {
            resolve("failed");
            return;
          }

          if (isRecord(response) && response.skipped === true) {
            resolve("skipped");
            return;
          }

          if (isRecord(response) && response.success === false) {
            resolve("failed");
            return;
          }

          resolve("sent");
        }
      );
    } catch {
      resolve("failed");
    }
  });
}

function getCompletionNotificationMessage(): string {
  return i18n.lang === "zh"
    ? "回复已完成，可以回来查看。"
    : "The response is ready to review.";
}

function hashStableString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
