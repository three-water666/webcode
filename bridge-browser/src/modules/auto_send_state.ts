export type AutoSendState = (
  | { phase: "waiting"; sendAt: number; isRetry: boolean }
  | { phase: "preparing" | "sending" | "sent" | "cancelled" | "disabled" | "failed" }
) & { requestKeys?: readonly string[] };

type AutoSendStateListener = (state: AutoSendState | null) => void;

let currentState: AutoSendState | null = null;
const listeners = new Set<AutoSendStateListener>();

export function setAutoSendState(state: AutoSendState | null): void {
  currentState = state;
  listeners.forEach((listener) => listener(state));
}

export function subscribeAutoSendState(listener: AutoSendStateListener): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => listeners.delete(listener);
}
