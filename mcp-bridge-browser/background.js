// === WebMCP Background Service (MV3 Persistent Edition) ===

// 初始化：加载多语言资源文件
chrome.runtime.onInstalled.addListener(async () => {
  const files = {
    prompt_en: "prompt.md",
    prompt_zh: "prompt_zh.md",
    train_en: "train.md",
    train_zh: "train_zh.md",
    error_en: "error_hint.md",
    error_zh: "error_hint_zh.md"
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

// === 保持连接逻辑 ===
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
      const session = await getSession(tabId);
      if (session) {
          updateBadge(tabId, true);
          if (session.showLog) {
              chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_LOG', show: true }).catch(() => {});
          }
      }
  }
});

// === 消息处理中心 ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const currentTabId = sender.tab ? sender.tab.id : null;
  if (request.type === 'HANDSHAKE') {
    handleHandshake(request, currentTabId).then(sendResponse);
    return true;
  }
  if (request.type === 'GET_STATUS') {
    const targetTabId = request.tabId;
    getSession(targetTabId).then(session => {
        sendResponse({ 
            connected: !!session, 
            port: session?.port,
            showLog: session?.showLog || false 
        });
    });
    return true;
  }
  if (request.type === 'SET_LOG_VISIBLE') {
     const targetTabId = request.tabId;
     const show = request.show;
     updateSessionLog(targetTabId, show).then(() => {
         chrome.tabs.sendMessage(targetTabId, { type: 'TOGGLE_LOG', show: show }).catch(() => {});
         sendResponse({ success: true });
     });
     return true;
  }
  if (request.type === "EXECUTE_TOOL") {
    executeTool(request, currentTabId).then(sendResponse);
    return true;
  }
  // === 新增：自动唤醒功能 ===
  if (request.type === "ACTIVATE_TAB") {
      if (currentTabId) {
          // 1. 激活标签页
          chrome.tabs.update(currentTabId, { active: true });
          // 2. 激活窗口 (置顶)
          chrome.windows.update(sender.tab.windowId, { focused: true });
          sendResponse({ success: true });
      }
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
          if (key.startsWith('session_') && val.port === port && key !== `session_${tabId}`) {
             conflictTabId = key.replace('session_', '');
             break;
          }
      }
      if (conflictTabId) {
          try {
              const tab = await chrome.tabs.get(parseInt(conflictTabId));
              if (tab) {
                  return { success: false, error: 'BUSY', conflictTabId };
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
    return { success: false, error: "Session Lost. Please reconnect from VS Code." };
  }
  const { port, token } = session;
  const apiEndpoint = `http://127.0.0.1:${port}/v1/tools/call`;
  try {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-WebMCP-Token": token
      },
      body: JSON.stringify({
        name: request.payload.name,
        arguments: request.payload.arguments || {}
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
         return { success: false, error: `${response.status} - ${response.statusText}` };
      }
    }
  } catch (err) {
    return { success: false, error: `Connection Failed: ${err.message}` };
  }
}
chrome.tabs.onRemoved.addListener((tabId) => {
  removeSession(tabId);
});