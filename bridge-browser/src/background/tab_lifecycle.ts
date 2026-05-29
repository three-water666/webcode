import { BRANDING } from '@webcode/shared';

import { updateBadge } from './badge';
import { getSession, removeSession } from './sessions';
import { checkUrlSafety, isBridgePageUrl } from './url_safety';

export async function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
) {
  // Use URL from changeInfo if available, otherwise fallback to tab.url
  const currentUrl = changeInfo.url ?? tab.url;

  if (!currentUrl) {return;}

  const isBridgePage = isBridgePageUrl(currentUrl);

  if (changeInfo.url) {
    const session = await getSession(tabId);
    const isSafe = await checkUrlSafety(changeInfo.url, session, isBridgePage);
    if (!isSafe) {
      if (session) {
        console.log(`${BRANDING.logPrefix} Security Fuse: Url changed to ${changeInfo.url}, revoking session.`);
        await removeSession(tabId);
        updateBadge(tabId, false);
        return;
      }
    }
  }

  if (changeInfo.status === "complete") {
    const session = await getSession(tabId);
    if (!session) {return;}

    const isSafe = await checkUrlSafety(currentUrl, session, isBridgePage);

    if (isSafe) {
      updateBadge(tabId, true);
      // [Sync] Restore connection state in Content Script after reload
      void chrome.tabs
        .sendMessage(tabId, { type: "STATUS_UPDATE", connected: true, workspaceId: session.workspaceId })
        .catch(ignoreRuntimeError);
      if (session.showLog) {
        void chrome.tabs.sendMessage(tabId, { type: "TOGGLE_LOG", show: true }).catch(ignoreRuntimeError);
      }
    } else {
      await removeSession(tabId);
      updateBadge(tabId, false);
    }
  }
}

export function handleTabRemoved(tabId: number) {
  void removeSession(tabId);
}

function ignoreRuntimeError(_error: unknown): void {
  void chrome.runtime.lastError;
}
