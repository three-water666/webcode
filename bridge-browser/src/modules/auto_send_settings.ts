export const AUTO_SEND_DELAY_STORAGE_KEY = "autoSendDelaySeconds";
export const DEFAULT_AUTO_SEND_DELAY_SECONDS = 5;
export const MAX_AUTO_SEND_DELAY_SECONDS = 300;

export async function loadAutoSendDelaySeconds(): Promise<number> {
  const items = await chrome.storage.local.get([AUTO_SEND_DELAY_STORAGE_KEY]) as Record<string, unknown>;
  return normalizeAutoSendDelaySeconds(items[AUTO_SEND_DELAY_STORAGE_KEY]);
}

export function normalizeAutoSendDelaySeconds(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_AUTO_SEND_DELAY_SECONDS
  ) {
    return DEFAULT_AUTO_SEND_DELAY_SECONDS;
  }

  return Math.round(value);
}
