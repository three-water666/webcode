export type UserAttentionNotificationResult = "sent" | "skipped" | "failed";

interface UserAttentionNotificationOptions {
  title: string;
  message: string;
  onlyWhenWindowInBackground?: boolean;
}

interface UserAttentionOptions {
  playSound?: boolean;
}

export function requestUserAttention(
  options: UserAttentionOptions = {}
): Promise<UserAttentionNotificationResult> {
  return sendRuntimeRequestForAttention({
    type: "REQUEST_USER_ATTENTION",
    playSound: options.playSound === true,
  });
}

export function showUserAttentionNotification(
  options: UserAttentionNotificationOptions
): Promise<UserAttentionNotificationResult> {
  return sendRuntimeRequestForAttention({
    type: "SHOW_NOTIFICATION",
    title: options.title,
    message: options.message,
    onlyWhenWindowInBackground: options.onlyWhenWindowInBackground,
  });
}

export function clearUserAttention(): void {
  sendBestEffortRuntimeMessage({ type: "CLEAR_WINDOW_ATTENTION" });
}

function sendRuntimeRequestForAttention(
  request: Record<string, unknown>
): Promise<UserAttentionNotificationResult> {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      resolve("failed");
      return;
    }

    try {
      chrome.runtime.sendMessage(request, (response: unknown) => {
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
      });
    } catch {
      resolve("failed");
    }
  });
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
