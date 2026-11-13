export const DEFAULT_AUTO_SEND_DELAY_SECONDS = 0;
export const MAX_AUTO_SEND_DELAY_SECONDS = 300;

export function normalizeAutoSendDelaySeconds(
  value: unknown,
  fallback = DEFAULT_AUTO_SEND_DELAY_SECONDS
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_AUTO_SEND_DELAY_SECONDS
  ) {
    return fallback;
  }
  return Math.round(value);
}
