export function updateBadge(tabId: number, active: boolean) {
  if (active) {
    chrome.action.setBadgeText({ tabId, text: "ON" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#4CAF50" });
  } else {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
}
