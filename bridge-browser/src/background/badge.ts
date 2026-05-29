export function updateBadge(tabId: number, active: boolean) {
  if (active) {
    void chrome.action.setBadgeText({ tabId, text: "ON" });
    void chrome.action.setBadgeBackgroundColor({ tabId, color: "#4CAF50" });
  } else {
    void chrome.action.setBadgeText({ tabId, text: "" });
  }
}
