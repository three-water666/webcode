import { normalizeSession, type Session } from '../types';

export type CurrentProtocolSession = Session & {
  siteId: string;
  targetOrigin: string;
  targetUrl: string;
};

export async function getSession(tabId: number): Promise<Session | undefined> {
  const key = `session_${tabId}`;
  const result = await chrome.storage.local.get([key]) as Record<string, unknown>;
  return normalizeSession(result[key]) ?? undefined;
}

export async function getCurrentProtocolSession(tabId: number): Promise<CurrentProtocolSession | undefined> {
  const session = await getSession(tabId);
  if (!session) {
    return undefined;
  }

  if (isCurrentProtocolSession(session)) {
    return session;
  }

  await removeSession(tabId);
  return undefined;
}

export function isCurrentProtocolSession(session: Session): session is CurrentProtocolSession {
  return isNonEmptyString(session.siteId) &&
    isNonEmptyString(session.targetOrigin) &&
    isNonEmptyString(session.targetUrl);
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
  void chrome.tabs.sendMessage(tabId, { type: "STATUS_UPDATE", connected: false }).catch(ignoreRuntimeError);
}

function ignoreRuntimeError(_error: unknown): void {
  void chrome.runtime.lastError;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
