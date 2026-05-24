import { BRANDING } from '@webcode/shared';

export async function handleInstalled() {
  // 初始化用户配置 (storage.sync)
  const syncKeys = ["autoSend"];
  const existingSync = await chrome.storage.sync.get(syncKeys);
  const syncToSet: Record<string, any> = {};

  if (existingSync.autoSend === undefined) {syncToSet.autoSend = true;}

  if (Object.keys(syncToSet).length > 0) {
      await chrome.storage.sync.set(syncToSet);
      console.log(`${BRANDING.logPrefix} Initialized user settings (Preserved existing)`);
  }
}
