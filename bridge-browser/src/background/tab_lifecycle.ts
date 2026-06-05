import { BRANDING } from '@webcode/shared';

import { updateBadge } from './badge';
import { getCurrentProtocolSession, removeSession, suspendSession } from './sessions';
import { checkUrlSafety, isBridgePageUrl } from './url_safety';

export async function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
) {
  // Use URL from changeInfo if available, otherwise fallback to tab.url
  const currentUrl = changeInfo.url ?? tab.url;

  if (!currentUrl) {return;}

  if (changeInfo.url) {
    const session = await getCurrentProtocolSession(tabId);
    const isSafe = checkUrlSafety(changeInfo.url, session, isBridgePageUrl(changeInfo.url, session?.port));
    if (!isSafe) {
      if (session) {
        console.log(`${BRANDING.logPrefix} Security Fuse: Url changed to ${changeInfo.url}, suspending session.`);
        suspendSession(tabId);
        updateBadge(tabId, false);
        return;
      }
    }
  }

  if (changeInfo.status === "complete") {
    const session = await getCurrentProtocolSession(tabId);
    if (!session) {return;}

    const isSafe = checkUrlSafety(currentUrl, session, isBridgePageUrl(currentUrl, session.port));

    if (isSafe) {
      updateBadge(tabId, true);
      // [Sync] Restore connection state in Content Script after reload
      void chrome.tabs
        .sendMessage(tabId, {
          type: "STATUS_UPDATE",
          connected: true,
          workspaceId: session.workspaceId,
          siteId: session.siteId,
        })
        .catch(ignoreRuntimeError);
      if (session.showLog) {
        void chrome.tabs.sendMessage(tabId, { type: "TOGGLE_LOG", show: true }).catch(ignoreRuntimeError);
      }
    } else {
      suspendSession(tabId);
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
