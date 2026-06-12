export function updateBadge(tabId: number, active: boolean) {
  if (active) {
    void chrome.action.setBadgeText({ tabId, text: "ON" }).catch(ignoreRuntimeError);
    void chrome.action.setBadgeBackgroundColor({ tabId, color: "#4CAF50" }).catch(ignoreRuntimeError);
  } else {
    void chrome.action.setBadgeText({ tabId, text: "" }).catch(ignoreRuntimeError);
  }
}

function ignoreRuntimeError(_error: unknown): void {
  void chrome.runtime.lastError;
}
