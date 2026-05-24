import { handleInstalled } from './defaults';
import { handleRuntimeMessage } from './messages';
import { focusNotificationSourceTab } from './notifications';
import { handleTabRemoved, handleTabUpdated } from './tab_lifecycle';

// === Background Service (MV3 Persistent Edition) ===

// 初始化：设置默认状态
chrome.runtime.onInstalled.addListener(handleInstalled);

// === 保持连接逻辑 & 安全熔断 ===
chrome.tabs.onUpdated.addListener(handleTabUpdated);

// === 消息处理中心 ===
chrome.runtime.onMessage.addListener(handleRuntimeMessage);

chrome.notifications.onClicked.addListener((notificationId) => {
  void focusNotificationSourceTab(notificationId);
});

chrome.tabs.onRemoved.addListener(handleTabRemoved);
