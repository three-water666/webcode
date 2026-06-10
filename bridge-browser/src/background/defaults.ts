import { BRANDING } from '@webcode/shared';

export async function handleInstalled(details?: chrome.runtime.InstalledDetails) {
  if (details?.reason === chrome.runtime.OnInstalledReason.UPDATE) {
    await clearStoredSessions();
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
