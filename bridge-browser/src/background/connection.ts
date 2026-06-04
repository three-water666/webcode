import { BRANDING } from '@webcode/shared';

import { type HandshakeResponse, isStoredSession, type MessageRequest } from '../types';
import { updateBadge } from './badge';
import { fetchInitDataFromGateway } from './init_sync';
import { removeSession, saveSession } from './sessions';

interface HandshakeParams {
  port: number;
  token: string;
  siteId?: string;
  force?: boolean;
  workspaceId: string;
  targetOrigin?: string;
  targetUrl?: string;
}

export async function handleHandshake(request: MessageRequest, tabId: number | null | undefined): Promise<HandshakeResponse> {
  const params = getHandshakeParams(request);

  if (!tabId) {return { success: false, error: "No Tab ID" };}
  if (!params) {
    return { success: false, error: "Invalid handshake parameters" };
  }

  if (!params.force) {
    const conflictTabId = await findConflictTabId(params.port, tabId);
    if (conflictTabId) {
      try {
        const tab = await chrome.tabs.get(parseInt(conflictTabId, 10));
        if (tab) {
          return { success: false, error: "BUSY", conflictTabId };
        }
      } catch {
        await removeSession(parseInt(conflictTabId, 10));
      }
    }
  }
  await bindSession(tabId, {
    port: params.port,
    token: params.token,
    workspaceId: params.workspaceId,
    siteId: params.siteId,
    targetOrigin: params.targetOrigin,
    targetUrl: params.targetUrl,
  });
  return { success: true };
}

interface BindSessionOptions {
  port: number;
  token: string;
  workspaceId: string;
  siteId?: string;
  targetOrigin?: string;
  targetUrl?: string;
}

export async function bindSession(tabId: number, options: BindSessionOptions) {
  await saveSession(tabId, {
    port: options.port,
    token: options.token,
    showLog: false,
    workspaceId: options.workspaceId,
    siteId: options.siteId,
    targetOrigin: options.targetOrigin,
    targetUrl: options.targetUrl,
  });
  console.log(`${BRANDING.logPrefix} Tab ${tabId} bound to Port ${options.port} [Workspace: ${options.workspaceId}]`);
  updateBadge(tabId, true);
  // [Sync] Notify Content Script
  void chrome.tabs.sendMessage(tabId, {
    type: "STATUS_UPDATE",
    connected: true,
    workspaceId: options.workspaceId,
    siteId: options.siteId,
  }).catch(ignoreRuntimeError);
  // 不再 await，避免网关初始化请求阻塞握手响应
  void fetchInitDataFromGateway(options.port, options.token);
}

function ignoreRuntimeError(_error: unknown): void {
  void chrome.runtime.lastError;
}

function getHandshakeParams(request: MessageRequest): HandshakeParams | null {
  if (typeof request.port !== "number" || typeof request.token !== "string") {
    return null;
  }

  return {
    port: request.port,
    token: request.token,
    siteId: request.siteId,
    force: request.force,
    workspaceId: request.workspaceId ?? 'global',
    targetOrigin: request.targetOrigin,
    targetUrl: request.targetUrl,
  };
}

async function findConflictTabId(port: number, tabId: number): Promise<string | null> {
  const all = await chrome.storage.local.get(null) as Record<string, unknown>;
  for (const [key, val] of Object.entries(all)) {
    if (isConflictingSession(key, val, port, tabId)) {
      return key.replace("session_", "");
    }
  }

  return null;
}

function isConflictingSession(key: string, value: unknown, port: number, tabId: number): boolean {
  return key.startsWith("session_") &&
    isStoredSession(value) &&
    value.port === port &&
    key !== `session_${tabId}`;
}
