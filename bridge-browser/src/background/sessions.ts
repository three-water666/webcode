import { normalizeSession, type Session } from '../types';
import { checkUrlSafety, isBridgePageUrl } from './url_safety';

export type CurrentProtocolSession = Session & {
  siteId: string;
  targetOrigin: string;
  targetUrl: string;
};

export type ActiveProtocolSessionResult =
  | { status: "active"; session: CurrentProtocolSession }
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "suspended"; session: CurrentProtocolSession };

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

export async function getActiveProtocolSession(
  tabId: number,
  url?: string
): Promise<CurrentProtocolSession | undefined> {
  const result = await getActiveProtocolSessionResult(tabId, url);
  return result.status === "active" ? result.session : undefined;
}

export async function getActiveProtocolSessionResult(
  tabId: number,
  url?: string
): Promise<ActiveProtocolSessionResult> {
  const session = await getSession(tabId);
  if (!session) {
    return { status: "missing" };
  }

  if (!isCurrentProtocolSession(session)) {
    await removeSession(tabId);
    return { status: "invalid" };
  }

  const currentUrl = url ?? await getTabUrl(tabId);
  if (!currentUrl) {
    return { status: "suspended", session };
  }

  return checkUrlSafety(currentUrl, session, isBridgePageUrl(currentUrl, session.port))
    ? { status: "active", session }
    : { status: "suspended", session };
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

export async function updateSessionAutoSend(tabId: number, autoSend: boolean) {
  const session = await getSession(tabId);
  if (session) {
    session.autoSend = autoSend;
    await saveSession(tabId, session);
  }
}

export async function updateSessionAutoApproveTools(tabId: number, autoApproveTools: boolean) {
  const session = await getSession(tabId);
  if (session) {
    session.autoApproveTools = autoApproveTools;
    await saveSession(tabId, session);
  }
}

export function suspendSession(tabId: number) {
  void chrome.tabs.sendMessage(tabId, { type: "STATUS_UPDATE", connected: false }).catch(ignoreRuntimeError);
}

export async function removeSession(tabId: number) {
  const key = `session_${tabId}`;
  await chrome.storage.local.remove(key);
  // [Sync] Notify Content Script
  suspendSession(tabId);
}

async function getTabUrl(tabId: number): Promise<string | undefined> {
  try {
    return (await chrome.tabs.get(tabId)).url;
  } catch {
    return undefined;
  }
}

function ignoreRuntimeError(_error: unknown): void {
  void chrome.runtime.lastError;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
