export type UserAttentionNotificationResult = "sent" | "skipped" | "failed";

interface UserAttentionNotificationOptions {
  title: string;
  message: string;
  onlyWhenWindowInBackground?: boolean;
  drawAttention?: boolean;
}

export function showUserAttentionNotification(
  options: UserAttentionNotificationOptions
): Promise<UserAttentionNotificationResult> {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      resolve("failed");
      return;
    }

    try {
      chrome.runtime.sendMessage(
        {
          type: "SHOW_NOTIFICATION",
          title: options.title,
          message: options.message,
          onlyWhenWindowInBackground: options.onlyWhenWindowInBackground,
          drawAttention: options.drawAttention ?? true,
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

export function clearWindowAttention(): void {
  sendBestEffortRuntimeMessage({ type: "CLEAR_WINDOW_ATTENTION" });
}

function sendBestEffortRuntimeMessage(request: Record<string, unknown>): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {return;}

  try {
    chrome.runtime.sendMessage(request, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Content scripts can outlive the extension context during reloads or navigation.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
