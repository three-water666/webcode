import { BRANDING } from '@webcode/shared';

import { type MessageRequest } from '../types';
import { getErrorMessage } from './errors';

const NOTIFICATION_ID_PREFIX = "webcode-tab";

export async function updateWindowAttention(
  sender: chrome.runtime.MessageSender,
  drawAttention: boolean
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const windowId = sender.tab?.windowId;
  if (typeof windowId !== "number" || windowId === chrome.windows.WINDOW_ID_NONE) {
    return { success: false, error: "Missing Window ID" };
  }

  try {
    if (drawAttention) {
      const targetWindow = await chrome.windows.get(windowId);
      if (targetWindow.focused) {
        return { success: true, skipped: true };
      }
    }

    await chrome.windows.update(windowId, { drawAttention });
    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function showNotification(
  request: MessageRequest,
  sender: chrome.runtime.MessageSender
): Promise<{ success: boolean; skipped?: boolean; notificationId?: string; error?: string }> {
  try {
    if (request.onlyWhenWindowInBackground) {
      const shouldShowNotification = await shouldShowNotificationForSender(sender);
      if (!shouldShowNotification) {
        return { success: true, skipped: true };
      }
    }

    const notificationId = await createNotification(request, sender);

    return { success: true, notificationId };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

async function shouldShowNotificationForSender(sender: chrome.runtime.MessageSender): Promise<boolean> {
  try {
    const windowId = sender.tab?.windowId;
    if (typeof windowId !== "number" || windowId === chrome.windows.WINDOW_ID_NONE) {
      return true;
    }

    const targetWindow = await chrome.windows.get(windowId);
    if (targetWindow.focused === false || targetWindow.state === "minimized") {
      return true;
    }

    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      return false;
    }

    const targetTab = await chrome.tabs.get(tabId);
    return targetTab.active === false;
  } catch {
    return true;
  }
}

function createNotification(
  request: MessageRequest,
  sender: chrome.runtime.MessageSender
): Promise<string> {
  return new Promise((resolve, reject) => {
    const notificationId = createNotificationId(sender);
    chrome.notifications.create(
      notificationId,
      {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: request.title ?? BRANDING.notificationName,
        message: request.message ?? "Task Completed",
        priority: 2,
      },
      (createdNotificationId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(createdNotificationId);
      }
    );
  });
}

function createNotificationId(sender: chrome.runtime.MessageSender): string {
  const tabId = sender.tab?.id;
  const tabPart = typeof tabId === "number" ? String(tabId) : "none";
  const uniquePart = Math.random().toString(36).slice(2, 8);
  return `${NOTIFICATION_ID_PREFIX}-${tabPart}-${Date.now()}-${uniquePart}`;
}

function getNotificationSourceTabId(notificationId: string): number | null {
  const match = notificationId.match(new RegExp(`^${NOTIFICATION_ID_PREFIX}-(\\d+)-`));
  if (!match) {return null;}

  const tabId = Number(match[1]);
  return Number.isInteger(tabId) ? tabId : null;
}

export async function focusNotificationSourceTab(notificationId: string): Promise<void> {
  try {
    const tabId = getNotificationSourceTabId(notificationId);
    if (tabId === null) {return;}

    const tab = await chrome.tabs.get(tabId);
    if (typeof tab.windowId === "number" && tab.windowId !== chrome.windows.WINDOW_ID_NONE) {
      const targetWindow = await chrome.windows.get(tab.windowId);
      const updateInfo: chrome.windows.UpdateInfo = {
        drawAttention: false,
        focused: true,
      };
      if (targetWindow.state === "minimized") {
        updateInfo.state = "normal";
      }
      await chrome.windows.update(tab.windowId, updateInfo);
    }

    await chrome.tabs.update(tabId, { active: true });
  } catch (error) {
    console.warn(`${BRANDING.logPrefix} Failed to focus notification source tab:`, error);
  } finally {
    chrome.notifications.clear(notificationId, () => {
      void chrome.runtime.lastError;
    });
  }
}
