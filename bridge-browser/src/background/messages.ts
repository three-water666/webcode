import { isMessageRequest, type MessageRequest } from '../types';
import { playAttentionSound, type LogSoundType } from './attention_sound';
import { bindSession, handleHandshake } from './connection';
import { getErrorMessage } from './errors';
import { executeTool } from './gateway';
import { showNotification, updateWindowAttention } from './notifications';
import { getSession, updateSessionLog } from './sessions';

type SendResponse = (response?: unknown) => void;

export function handleRuntimeMessage(
  request: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse
): boolean {
  if (!isMessageRequest(request)) {
    return false;
  }

  return dispatchRuntimeMessage(request, sender, sendResponse);
}

function dispatchRuntimeMessage(
  request: MessageRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse
): boolean {
  const currentTabId = sender.tab ? sender.tab.id : null;

  switch (request.type) {
    case "HANDSHAKE":
      respondAsync(handleHandshake(request, currentTabId), sendResponse);
      return true;
    case "GET_STATUS":
      handleGetStatus(request, sender, sendResponse);
      return true;
    case "SET_LOG_VISIBLE":
      handleSetLogVisible(request, currentTabId, sendResponse);
      return true;
    case "SET_LOG_SOUND_ENABLED":
      handleSetLogSoundEnabled(request, currentTabId, sendResponse);
      return true;
    case "PLAY_LOG_SOUND":
      respondAsync(playLogSound(request), sendResponse);
      return true;
    case "REQUEST_USER_ATTENTION":
      respondAsync(requestUserAttention(request, sender), sendResponse);
      return true;
    case "CLEAR_WINDOW_ATTENTION":
      respondAsync(updateWindowAttention(sender, false), sendResponse);
      return true;
    case "EXECUTE_TOOL":
      respondAsync(executeTool(request, currentTabId), sendResponse);
      return true;
    case "SHOW_NOTIFICATION":
      respondAsync(showNotification(request, sender), sendResponse);
      return true;
    case "SYNC_CONFIG":
      sendResponse({ success: true });
      return true;
    case "CONNECT_EXISTING":
      handleConnectExisting(request, currentTabId, sendResponse);
      return true;
    default:
      return false;
  }
}

function handleGetStatus(
  request: MessageRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse
): void {
  const targetTabId = request.tabId ?? (sender.tab ? sender.tab.id : null);
  if (!targetTabId) {
    sendResponse({ connected: false, error: "Unknown Tab ID" });
    return;
  }

  respondAsync(
    Promise.all([
      getSession(targetTabId),
      chrome.storage.sync.get(["logSoundEnabled"]) as Promise<Record<string, unknown>>,
    ]).then(([session, syncItems]) => ({
      connected: Boolean(session),
      port: session?.port,
      showLog: session?.showLog ?? false,
      soundEnabled: syncItems.logSoundEnabled === true,
      workspaceId: session?.workspaceId ?? 'global',
    })),
    sendResponse
  );
}

function handleSetLogVisible(
  request: MessageRequest,
  currentTabId: number | null | undefined,
  sendResponse: SendResponse
): void {
  const targetTabId = request.tabId ?? currentTabId;
  const show = request.show ?? false;
  if (!targetTabId) {
    sendResponse({ success: false, error: "Missing Tab ID" });
    return;
  }

  respondAsync(
    updateSessionLog(targetTabId, show).then(() => {
      void chrome.tabs.sendMessage(targetTabId, { type: "TOGGLE_LOG", show }).catch(ignoreRuntimeError);
      chrome.runtime.sendMessage({ type: "LOG_VISIBLE_CHANGED", tabId: targetTabId, show }, () => {
        void chrome.runtime.lastError;
      });
      return { success: true };
    }),
    sendResponse
  );
}

function handleSetLogSoundEnabled(
  request: MessageRequest,
  currentTabId: number | null | undefined,
  sendResponse: SendResponse
): void {
  const targetTabId = request.tabId ?? currentTabId;
  const soundEnabled = request.soundEnabled === true;

  respondAsync(
    chrome.storage.sync.set({ logSoundEnabled: soundEnabled }).then(() => {
      if (targetTabId) {
        void chrome.tabs.sendMessage(targetTabId, {
          type: "SET_LOG_SOUND_ENABLED",
          soundEnabled,
        }).catch(ignoreRuntimeError);
      }
      return { success: true };
    }),
    sendResponse
  );
}

async function playLogSound(request: MessageRequest): Promise<{ success: boolean; error?: string }> {
  if (!isLogSoundType(request.logType)) {
    return { success: false, error: "Unsupported log sound type." };
  }

  return playAttentionSound(request.logType);
}

function isLogSoundType(value: unknown): value is LogSoundType {
  return value === "info" ||
    value === "success" ||
    value === "warn" ||
    value === "error" ||
    value === "action";
}

function handleConnectExisting(
  request: MessageRequest,
  currentTabId: number | null | undefined,
  sendResponse: SendResponse
): void {
  const targetTabId = request.tabId ?? currentTabId;
  if (!targetTabId) {
    sendResponse({ success: false, error: "Missing Tab ID" });
    return;
  }

  void chrome.storage.local.remove("session_null");
  if (!request.port || !request.token) {
    sendResponse({ success: false, error: "Missing port or token" });
    return;
  }

  const workspaceId = request.workspaceId ?? 'global';
  respondAsync(
    bindSession(targetTabId, request.port, request.token, workspaceId, request.targetOrigin)
      .then(() => ({ success: true })),
    sendResponse
  );
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

function respondAsync<T>(promise: Promise<T>, sendResponse: SendResponse): void {
  void promise.catch((error: unknown) => ({
    success: false,
    error: getErrorMessage(error),
  })).then(sendResponse);
}

function ignoreRuntimeError(_error: unknown): void {
  void chrome.runtime.lastError;
}
