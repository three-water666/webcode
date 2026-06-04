import { BRANDING } from '@webcode/shared';

export async function handleInstalled(details?: chrome.runtime.InstalledDetails) {
  if (details?.reason === chrome.runtime.OnInstalledReason.UPDATE) {
    await clearStoredSessions();
  }

  // 初始化用户配置 (storage.sync)
  const syncKeys = ["autoSend"];
  const existingSync = await chrome.storage.sync.get(syncKeys) as Record<string, unknown>;
  const syncToSet: Record<string, unknown> = {};

  if (existingSync.autoSend === undefined) {syncToSet.autoSend = true;}

  if (Object.keys(syncToSet).length > 0) {
      await chrome.storage.sync.set(syncToSet);
      console.log(`${BRANDING.logPrefix} Initialized user settings (Preserved existing)`);
  }
}

async function clearStoredSessions(): Promise<void> {
  const localItems = await chrome.storage.local.get(null) as Record<string, unknown>;
  const sessionKeys = Object.keys(localItems).filter((key) => key.startsWith('session_'));

  if (sessionKeys.length === 0) {
    return;
  }

  await chrome.storage.local.remove(sessionKeys);
  console.log(`${BRANDING.logPrefix} Cleared ${sessionKeys.length} stale session(s) after browser extension update.`);
}
