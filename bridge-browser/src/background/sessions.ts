import { type Session } from '../types';

export async function getSession(tabId: number): Promise<Session | undefined> {
  const key = `session_${tabId}`;
  const result = await chrome.storage.local.get([key]);
  return result[key];
}

export async function saveSession(tabId: number, data: Session) {
  const key = `session_${tabId}`;
  await chrome.storage.local.set({ [key]: data });
}

export async function updateSessionLog(tabId: number, showLog: boolean) {
  const session = await getSession(tabId);
  if (session) {
    session.showLog = showLog;
    await saveSession(tabId, session);
  }
}

export async function removeSession(tabId: number) {
  const key = `session_${tabId}`;
  await chrome.storage.local.remove(key);
  // [Sync] Notify Content Script
  chrome.tabs.sendMessage(tabId, { type: "STATUS_UPDATE", connected: false }).catch(() => {});
}
