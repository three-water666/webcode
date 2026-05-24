import { type MessageRequest } from '../types';
import { bindSession, handleHandshake } from './connection';
import { executeTool } from './gateway';
import { showNotification, updateWindowAttention } from './notifications';
import { getSession, updateSessionLog } from './sessions';

export function handleRuntimeMessage(
  request: MessageRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  const currentTabId = sender.tab ? sender.tab.id : null;

  if (request.type === "HANDSHAKE") {
    handleHandshake(request, currentTabId).then(sendResponse);
    return true;
  }
  if (request.type === "GET_STATUS") {
    // Support both external (Popup) and internal (Content Script) status checks
    const targetTabId = request.tabId ?? (sender.tab ? sender.tab.id : null);
    if (targetTabId) {
        getSession(targetTabId).then((session) => {
          sendResponse({
            connected: Boolean(session),
            port: session?.port,
            showLog: session?.showLog ?? false,
            workspaceId: session?.workspaceId ?? 'global'
          });
        });
    } else {
        sendResponse({ connected: false, error: "Unknown Tab ID" });
    }
    return true;
  }
  if (request.type === "SET_LOG_VISIBLE") {
    const targetTabId = request.tabId ?? currentTabId;
    const show = request.show ?? false;
    if (targetTabId) {
        updateSessionLog(targetTabId, show).then(() => {
        chrome.tabs.sendMessage(targetTabId, { type: "TOGGLE_LOG", show: show }).catch(() => {});
        chrome.runtime.sendMessage({ type: "LOG_VISIBLE_CHANGED", tabId: targetTabId, show }, () => {
          void chrome.runtime.lastError;
        });
        sendResponse({ success: true });
        });
    } else {
      sendResponse({ success: false, error: "Missing Tab ID" });
    }
    return true;
  }
  if (request.type === "REQUEST_WINDOW_ATTENTION") {
    updateWindowAttention(sender, true).then(sendResponse);
    return true;
  }
  if (request.type === "CLEAR_WINDOW_ATTENTION") {
    updateWindowAttention(sender, false).then(sendResponse);
    return true;
  }
  if (request.type === "EXECUTE_TOOL") {
    executeTool(request, currentTabId).then(sendResponse);
    return true;
  }

  if (request.type === "SHOW_NOTIFICATION") {
    showNotification(request, sender).then(sendResponse);
    return true;
  }
  if (request.type === "SYNC_CONFIG") {
    // Config syncing to host is deprecated. Initialization data now comes from the VS Code gateway.
    sendResponse({ success: true });
    return true;
  }
  if (request.type === "CONNECT_EXISTING") {
    const targetTabId = request.tabId ?? currentTabId;
    if (!targetTabId) {
      sendResponse({ success: false, error: "Missing Tab ID" });
      return true;
    }

    chrome.storage.local.remove("session_null");

    if (request.port && request.token) {
        // Fallback workspaceId if not provided during manual connect
        const workspaceId = request.workspaceId ?? 'global';
        bindSession(targetTabId, request.port, request.token, workspaceId, request.targetOrigin)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    }
    return true;
  }
  return false;
}
