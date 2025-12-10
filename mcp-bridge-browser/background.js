// === WebMCP Background Service (MV3 Persistent Edition) ===

// 初始化：加载多语言资源文件
chrome.runtime.onInstalled.addListener(async () => {
  const files = {
    prompt_en: "prompt.md",
    prompt_zh: "prompt_zh.md",
    train_en: "train.md",
    train_zh: "train_zh.md",
    error_en: "error_hint.md",
    error_zh: "error_hint_zh.md",
  };

  const storageData = {};

  // 使用 fetch 读取扩展内的 .md 文件
  for (const [key, file] of Object.entries(files)) {
    try {
      const url = chrome.runtime.getURL(file);
      const response = await fetch(url);
      if (response.ok) {
        storageData[key] = await response.text();
      } else {
        console.error(`Failed to load ${file}`);
      }
    } catch (err) {
      console.error(`Error loading ${file}`, err);
    }
  }

  // 兼容旧逻辑
  if (storageData.prompt_en) {
    storageData.initialPrompt = storageData.prompt_en;
  }

  // 仅写入尚未存在的配置
  const existing = await chrome.storage.local.get(Object.keys(storageData));
  const toSet = {};
  for (const [key, val] of Object.entries(storageData)) {
    if (!existing[key]) {
      toSet[key] = val;
    }
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
    console.log("[WebMCP] Initialized defaults including Error Hints");
  }
});

// === 工具函数：检查 URL 是否在白名单 ===
function isUrlAllowed(url) {
  if (!url) return false;
  const manifest = chrome.runtime.getManifest();

  // [Fix] 合并 host_permissions 和 content_scripts.matches
  // Bridge 页面通常运行在 content_scripts 定义的特定端口上
  const hostPatterns = manifest.host_permissions || [];
  const scriptPatterns = (manifest.content_scripts || []).flatMap(
    (cs) => cs.matches || []
  );
  const allPatterns = [...new Set([...hostPatterns, ...scriptPatterns])];

  return allPatterns.some((pattern) => {
    // 1. 去掉末尾的通配符 *
    const base = pattern.replace(/\*$/, "");
    // 2. 宽松匹配
    return url.startsWith(base) || url === base.replace(/\/$/, "");
  });
}

// === 保持连接逻辑 & 安全熔断 ===
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 1. 安全熔断：如果 URL 变化且不在白名单中，立即销毁 Session
  if (changeInfo.url) {
    if (!isUrlAllowed(changeInfo.url)) {
      const session = await getSession(tabId);
      if (session) {
        console.log(
          `[WebMCP] Security Fuse: Url changed to ${changeInfo.url}, revoking session.`
        );
        await removeSession(tabId);
        updateBadge(tabId, false);
        return;
      }
    }
  }

  // 2. 状态恢复
  if (changeInfo.status === "complete") {
    const session = await getSession(tabId);
    // 双重检查：即使 Session 存在，URL 也必须合法（防止边界情况）
    if (session && isUrlAllowed(tab.url)) {
      updateBadge(tabId, true);
      if (session.showLog) {
        chrome.tabs
          .sendMessage(tabId, { type: "TOGGLE_LOG", show: true })
          .catch(() => {});
      }
    } else if (session && !isUrlAllowed(tab.url)) {
      // 如果加载完成时发现是不合法 URL，也清理掉
      await removeSession(tabId);
      updateBadge(tabId, false);
    }
  }
});

// === 消息处理中心 ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const currentTabId = sender.tab ? sender.tab.id : null;

  if (request.type === "HANDSHAKE") {
    handleHandshake(request, currentTabId).then(sendResponse);
    return true;
  }
  if (request.type === "GET_STATUS") {
    const targetTabId = request.tabId;
    getSession(targetTabId).then((session) => {
      sendResponse({
        connected: !!session,
        port: session?.port,
        showLog: session?.showLog || false,
      });
    });
    return true;
  }
  if (request.type === "SET_LOG_VISIBLE") {
    const targetTabId = request.tabId;
    const show = request.show;
    updateSessionLog(targetTabId, show).then(() => {
      chrome.tabs
        .sendMessage(targetTabId, { type: "TOGGLE_LOG", show: show })
        .catch(() => {});
      sendResponse({ success: true });
    });
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
      title: request.title || "WebMCP Notification",
      message: request.message || "Task Completed",
      priority: 2,
    });
    return true;
  }
  if (request.type === "CONNECT_EXISTING") {
    // 优先使用请求中显式传递的 tabId (来自 Popup)，否则回退到 sender (来自 ContentScript)
    const targetTabId = request.tabId || currentTabId;
    if (!targetTabId) {
      sendResponse({ success: false, error: "Missing Tab ID" });
      return true;
    }

    // 顺便清理之前可能产生的错误数据
    chrome.storage.local.remove("session_null");

    bindSession(targetTabId, request.port, request.token)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// === 数据层 ===
async function getSession(tabId) {
  const key = `session_${tabId}`;
  const result = await chrome.storage.local.get([key]);
  return result[key];
}
async function saveSession(tabId, data) {
  const key = `session_${tabId}`;
  await chrome.storage.local.set({ [key]: data });
}
async function updateSessionLog(tabId, showLog) {
  const session = await getSession(tabId);
  if (session) {
    session.showLog = showLog;
    await saveSession(tabId, session);
  }
}
async function removeSession(tabId) {
  const key = `session_${tabId}`;
  await chrome.storage.local.remove(key);
}

// === 逻辑实现 ===
async function handleHandshake(request, tabId) {
  const { port, token, force } = request;
  if (!force) {
    const all = await chrome.storage.local.get(null);
    let conflictTabId = null;
    for (const [key, val] of Object.entries(all)) {
      if (
        key.startsWith("session_") &&
        val.port === port &&
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
      } catch (e) {
        await removeSession(conflictTabId);
      }
    }
  }
  await bindSession(tabId, port, token);
  return { success: true };
}

async function bindSession(tabId, port, token) {
  await saveSession(tabId, { port, token, showLog: false });
  console.log(`[WebMCP] Tab ${tabId} bound to Port ${port}`);
  updateBadge(tabId, true);
}

function updateBadge(tabId, active) {
  if (active) {
    chrome.action.setBadgeText({ tabId, text: "ON" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#4CAF50" });
  } else {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
}

async function executeTool(request, tabId) {
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
        "X-WebMCP-Token": token,
      },
      body: JSON.stringify({
        name: request.payload.name,
        arguments: request.payload.arguments || {},
      }),
    });
    if (response.ok) {
      const resJson = await response.json();
      const textContent = resJson.content
        ? resJson.content.map((c) => c.text).join("\n")
        : JSON.stringify(resJson);
      return { success: true, data: textContent };
    } else {
      if (response.status === 403) {
        return { success: false, error: "Session Expired/Invalid Token." };
      } else {
        return {
          success: false,
          error: `${response.status} - ${response.statusText}`,
        };
      }
    }
  } catch (err) {
    return { success: false, error: `Connection Failed: ${err.message}` };
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  removeSession(tabId);
});
