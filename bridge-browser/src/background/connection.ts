import { BRANDING } from '@webcode/shared';

import { type HandshakeResponse, type Session } from '../types';
import { updateBadge } from './badge';
import { fetchInitDataFromGateway } from './init_sync';
import { removeSession, saveSession } from './sessions';

export async function handleHandshake(request: any, tabId: number | null | undefined): Promise<HandshakeResponse> {
  const { port, token, force, workspaceId = 'global', targetOrigin } = request;

  if (!tabId) {return { success: false, error: "No Tab ID" };}

  if (!force) {
    const all = await chrome.storage.local.get(null);
    let conflictTabId: string | null = null;
    for (const [key, val] of Object.entries(all)) {
      if (
        key.startsWith("session_") &&
        (val as Session).port === port &&
        key !== `session_${tabId}`
      ) {
        conflictTabId = key.replace("session_", "");
        break;
      }
    }
    if (conflictTabId) {
      try {
        const tab = await chrome.tabs.get(parseInt(conflictTabId));
        if (tab) {
          return { success: false, error: "BUSY", conflictTabId };
        }
      } catch {
        await removeSession(parseInt(conflictTabId));
      }
    }
  }
  await bindSession(tabId, port, token, workspaceId, targetOrigin);
  return { success: true };
}

export async function bindSession(tabId: number, port: number, token: string, workspaceId: string, targetOrigin?: string) {
  const allowedOrigins = targetOrigin ? [targetOrigin] : [];
  await saveSession(tabId, { port, token, showLog: false, workspaceId, allowedOrigins });
  console.log(`${BRANDING.logPrefix} Tab ${tabId} bound to Port ${port} [Workspace: ${workspaceId}]`);
  updateBadge(tabId, true);
  // [Sync] Notify Content Script
  chrome.tabs.sendMessage(tabId, { type: "STATUS_UPDATE", connected: true, workspaceId }).catch(() => {});
  // 不再 await，避免网关初始化请求阻塞握手响应
  fetchInitDataFromGateway(port, token);
}
