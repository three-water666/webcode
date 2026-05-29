import { isMessageRequest, type MessageRequest } from '../types';
import { playAttentionSound } from './attention_sound';
import { bindSession, handleHandshake } from './connection';
import { getErrorMessage } from './errors';
import { executeTool } from './gateway';
import { showNotification, updateWindowAttention } from './notifications';
import { getSession, updateSessionLog } from './sessions';

export function handleRuntimeMessage(
  request: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  if (!isMessageRequest(request)) {
    return false;
  }

  const currentTabId = sender.tab ? sender.tab.id : null;

  if (request.type === "HANDSHAKE") {
    respondAsync(handleHandshake(request, currentTabId), sendResponse);
    return true;
  }
  if (request.type === "GET_STATUS") {
    // Support both external (Popup) and internal (Content Script) status checks
    const targetTabId = request.tabId ?? (sender.tab ? sender.tab.id : null);
    if (targetTabId) {
        respondAsync(
          getSession(targetTabId).then((session) => ({
            connected: Boolean(session),
            port: session?.port,
            showLog: session?.showLog ?? false,
            workspaceId: session?.workspaceId ?? 'global'
          })),
          sendResponse
        );
    } else {
        sendResponse({ connected: false, error: "Unknown Tab ID" });
    }
    return true;
  }
  if (request.type === "SET_LOG_VISIBLE") {
    const targetTabId = request.tabId ?? currentTabId;
    const show = request.show ?? false;
    if (targetTabId) {
        respondAsync(
          updateSessionLog(targetTabId, show).then(() => {
            void chrome.tabs.sendMessage(targetTabId, { type: "TOGGLE_LOG", show: show }).catch(ignoreRuntimeError);
            chrome.runtime.sendMessage({ type: "LOG_VISIBLE_CHANGED", tabId: targetTabId, show }, () => {
              void chrome.runtime.lastError;
            });
            return { success: true };
          }),
          sendResponse
        );
    } else {
      sendResponse({ success: false, error: "Missing Tab ID" });
    }
    return true;
  }
  if (request.type === "REQUEST_USER_ATTENTION") {
    respondAsync(requestUserAttention(request, sender), sendResponse);
    return true;
  }
  if (request.type === "CLEAR_WINDOW_ATTENTION") {
    respondAsync(updateWindowAttention(sender, false), sendResponse);
    return true;
  }
  if (request.type === "EXECUTE_TOOL") {
    respondAsync(executeTool(request, currentTabId), sendResponse);
    return true;
  }

  if (request.type === "SHOW_NOTIFICATION") {
    respondAsync(showNotification(request, sender), sendResponse);
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

    void chrome.storage.local.remove("session_null");

    if (request.port && request.token) {
        // Fallback workspaceId if not provided during manual connect
        const workspaceId = request.workspaceId ?? 'global';
        respondAsync(
          bindSession(targetTabId, request.port, request.token, workspaceId, request.targetOrigin)
            .then(() => ({ success: true })),
          sendResponse
        );
    }
    return true;
  }
  return false;
}

async function requestUserAttention(
  request: MessageRequest,
  sender: chrome.runtime.MessageSender
): Promise<{ success: boolean; error?: string; skipped?: boolean; sound?: "played" | "failed"; soundError?: string }> {
  const attentionResult = await updateWindowAttention(sender, true);

  if (!request.playSound) {
    return attentionResult;
  }

  const soundResult = await playAttentionSound();
  if (!soundResult.success) {
    return {
      ...attentionResult,
      sound: "failed",
      soundError: soundResult.error,
    };
  }

  return {
    ...attentionResult,
    sound: "played",
  };
}

function respondAsync<T>(promise: Promise<T>, sendResponse: (response?: unknown) => void): void {
  void promise.catch((error: unknown) => ({
    success: false,
    error: getErrorMessage(error),
  })).then(sendResponse);
}

function ignoreRuntimeError(_error: unknown): void {
  void chrome.runtime.lastError;
}
