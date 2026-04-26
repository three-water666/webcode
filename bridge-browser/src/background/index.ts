import { type Session, type MessageRequest, type HandshakeResponse } from '../types';
import { BRANDING, PROTOCOL } from '@webcode/shared';

// === Background Service (MV3 Persistent Edition) ===

// 初始化：设置默认状态
chrome.runtime.onInstalled.addListener(async () => {
  // 初始化用户配置 (storage.sync)
  const syncKeys = ["autoSend"];
  const existingSync = await chrome.storage.sync.get(syncKeys);
  const syncToSet: Record<string, any> = {};

  if (existingSync.autoSend === undefined) {syncToSet.autoSend = true;}

  if (Object.keys(syncToSet).length > 0) {
      await chrome.storage.sync.set(syncToSet);
      console.log(`${BRANDING.logPrefix} Initialized user settings (Preserved existing)`);
  }
});

// === 工具函数：检查 URL 是否在白名单 ===
// Helper to extract the core domain/URL path without query parameters or hash
function getBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Special handling for legacy matching behavior (e.g. ignoring trailing slashes)
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url;
  }
}

function getOrigin(url: string | undefined): string | null {
  if (!url) {return null;}
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// === 保持连接逻辑 & 安全熔断 ===
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Use URL from changeInfo if available, otherwise fallback to tab.url
  const currentUrl = changeInfo.url ?? tab.url;

  if (!currentUrl) {return;}

  const isBridgePage = currentUrl.startsWith('http://127.0.0.1:') || currentUrl.startsWith('http://localhost:');

  const checkUrlSafety = async (url: string, session?: Session) => {
    if (isBridgePage) {return true;}

    const currentOrigin = getOrigin(url);
    if (currentOrigin && session?.allowedOrigins?.includes(currentOrigin)) {
      return true;
    }

    // Check against dynamic sites configuration
    const localItems = await chrome.storage.local.get(["syncedAiSites"]);
    const sites = localItems.syncedAiSites ?? [];

    // Allow if the URL starts with any configured address or fallback address
    const baseUrl = getBaseUrl(url);
    const inDynamic = sites.some((site: any) => baseUrl.startsWith(site.address));

    return inDynamic;
  };

  if (changeInfo.url) {
    const session = await getSession(tabId);
    const isSafe = await checkUrlSafety(changeInfo.url, session);
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

    const isSafe = await checkUrlSafety(currentUrl, session);

    if (isSafe) {
      updateBadge(tabId, true);
      // [Sync] Restore connection state in Content Script after reload
      chrome.tabs.sendMessage(tabId, { type: "STATUS_UPDATE", connected: true, workspaceId: session.workspaceId }).catch(() => {});
      if (session.showLog) {
        chrome.tabs.sendMessage(tabId, { type: "TOGGLE_LOG", show: true }).catch(() => {});
      }
    } else {
      await removeSession(tabId);
      updateBadge(tabId, false);
    }
  }
});

// === 消息处理中心 ===
chrome.runtime.onMessage.addListener((request: MessageRequest, sender, sendResponse) => {
  const currentTabId = sender.tab ? sender.tab.id : null;

  if (request.type === "HANDSHAKE") {
    handleHandshake(request, currentTabId).then(sendResponse);
    return true;
  }
  if (request.type === "GET_STATUS") {
    // Support both external (Popup) and internal (Content Script) status checks
    const targetTabId = request.tabId ?? (sender.tab ? sender.tab.id : null);
    if (targetTabId) {
        getSession(targetTabId).then((session) => {
          sendResponse({
            connected: Boolean(session),
            port: session?.port,
            showLog: session?.showLog ?? false,
            workspaceId: session?.workspaceId ?? 'global'
          });
        });
    } else {
        sendResponse({ connected: false, error: "Unknown Tab ID" });
    }
    return true;
  }
  if (request.type === "SET_LOG_VISIBLE") {
    const targetTabId = request.tabId;
    const show = request.show ?? false;
    if (targetTabId) {
        updateSessionLog(targetTabId, show).then(() => {
        chrome.tabs.sendMessage(targetTabId, { type: "TOGGLE_LOG", show: show }).catch(() => {});
        sendResponse({ success: true });
        });
    }
    return true;
  }
  if (request.type === "EXECUTE_TOOL") {
    executeTool(request, currentTabId).then(sendResponse);
    return true;
  }

  if (request.type === "SHOW_NOTIFICATION") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: request.title ?? BRANDING.notificationName,
      message: request.message ?? "Task Completed",
      priority: 2,
    });
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

    chrome.storage.local.remove("session_null");

    if (request.port && request.token) {
        // Fallback workspaceId if not provided during manual connect
        const workspaceId = request.workspaceId ?? 'global';
        bindSession(targetTabId, request.port, request.token, workspaceId, request.targetOrigin)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    }
    return true;
  }
  return false;
});

// === 数据层 ===
async function getSession(tabId: number): Promise<Session | undefined> {
  const key = `session_${tabId}`;
  const result = await chrome.storage.local.get([key]);
  return result[key];
}

async function saveSession(tabId: number, data: Session) {
  const key = `session_${tabId}`;
  await chrome.storage.local.set({ [key]: data });
}

async function updateSessionLog(tabId: number, showLog: boolean) {
  const session = await getSession(tabId);
  if (session) {
    session.showLog = showLog;
    await saveSession(tabId, session);
  }
}

async function removeSession(tabId: number) {
  const key = `session_${tabId}`;
  await chrome.storage.local.remove(key);
  // [Sync] Notify Content Script
  chrome.tabs.sendMessage(tabId, { type: "STATUS_UPDATE", connected: false }).catch(() => {});
}

// === 逻辑实现 ===
async function handleHandshake(request: any, tabId: number | null | undefined): Promise<HandshakeResponse> {
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

async function bindSession(tabId: number, port: number, token: string, workspaceId: string, targetOrigin?: string) {
  const allowedOrigins = targetOrigin ? [targetOrigin] : [];
  await saveSession(tabId, { port, token, showLog: false, workspaceId, allowedOrigins });
  console.log(`${BRANDING.logPrefix} Tab ${tabId} bound to Port ${port} [Workspace: ${workspaceId}]`);
  updateBadge(tabId, true);
  // [Sync] Notify Content Script
  chrome.tabs.sendMessage(tabId, { type: "STATUS_UPDATE", connected: true, workspaceId }).catch(() => {});
  // 不再 await，避免网关初始化请求阻塞握手响应
  fetchInitDataFromGateway(port, token);
}

// === 配置拉取 (Init Sync) ===
async function fetchInitDataFromGateway(port: number, token: string) {
  try {
    console.log(`${BRANDING.logPrefix} Fetching initialization data from Gateway...`);
    const resp = await fetch(`http://127.0.0.1:${port}/v1/init`, {
      headers: { [PROTOCOL.authHeaderName]: token },
    });
    if (!resp.ok) {
        console.warn(`${BRANDING.logPrefix} Gateway did not respond to /v1/init (might be an older version)`);
        return;
    }
    const data = await resp.json();

    if (data.prompts) {
      console.log(`${BRANDING.logPrefix} Overwriting local rules with Gateway Defaults.`);

      await chrome.storage.local.set({
        syncedAiSites: data.syncedAiSites ?? [], // Save dynamically injected AI sites & selectors
        ...data.prompts // prompt_en, prompt_zh, train_en... etc.
      });
    }
  } catch (e) {
    console.error(`${BRANDING.logPrefix} Initialization sync failed:`, e);
  }
}

function updateBadge(tabId: number, active: boolean) {
  if (active) {
    chrome.action.setBadgeText({ tabId, text: "ON" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#4CAF50" });
  } else {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
}

async function executeTool(request: any, tabId: number | null | undefined) {
  if (!tabId) {return { success: false, error: "No Session Tab" };}
  const session = await getSession(tabId);
  if (!session) {
    return {
      success: false,
      error: "Session Lost. Please reconnect from VS Code.",
    };
  }
  const { port, token } = session;
  const apiEndpoint = `http://127.0.0.1:${port}/v1/tools/call`;
  try {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [PROTOCOL.authHeaderName]: token,
      },
      body: JSON.stringify({
        name: request.payload.name,
        arguments: request.payload.arguments ?? {},
      }),
    });
    if (response.ok) {
      const resJson = await response.json();
      const textContent = resJson.content
        ? resJson.content.map((c: any) => c.text).join("\n")
        : JSON.stringify(resJson);
      return { success: true, data: textContent };
    }
    if (response.status === 403) {
      return { success: false, error: "Session Expired/Invalid Token." };
    }
    return {
      success: false,
      error: `${response.status} - ${response.statusText}`,
    };
  } catch (err: any) {
    return { success: false, error: `Connection Failed: ${err.message}` };
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  removeSession(tabId);
});
