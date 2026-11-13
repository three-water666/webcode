import type { SiteSelectors } from "../src/modules/config";
import {
  AUTO_SEND_DELAY_STORAGE_KEY, loadAutoSendDelaySeconds, normalizeAutoSendDelaySeconds,
} from "../src/modules/auto_send_settings";
import { subscribeAutoSendState, type AutoSendState } from "../src/modules/auto_send_state";

export {};

interface FakeFocusable {
  focus: () => void;
  shadowRoot?: { activeElement: FakeFocusable | null };
}

class FakeInput implements FakeFocusable {
  public innerText = "";
  public clearOnSend = true;
  public sendAttempts = 0;

  public contains(): boolean {
    return false;
  }

  public dispatchEvent(event: Event): boolean {
    if (event.type === "keydown" && (event as KeyboardEvent).key === "Enter") {
      this.sendAttempts++;
      if (this.clearOnSend) {this.innerText = "";}
    }
    return true;
  }

  public focus(): void {
    fakeDocument.activeElement = this;
  }

  public getBoundingClientRect(): DOMRect {
    return {
      bottom: 40,
      height: 40,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }
}

const input = new FakeInput();
const inputListeners = new Set<(event: Event) => void>();
const fakeDocument: {
  activeElement: FakeFocusable | null;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
  querySelector: () => null;
  querySelectorAll: (selector: string) => FakeInput[];
} = {
  activeElement: input,
  addEventListener: (_type, listener) => inputListeners.add(listener),
  removeEventListener: (_type, listener) => inputListeners.delete(listener),
  querySelector: () => null,
  querySelectorAll: (selector: string) => selector === "#input" ? [input] : [],
};
const timers = new Map<number, { callback: () => void; delayMs: number }>();
let nextTimerId = 1;
let now = 0;

const SELECTORS: SiteSelectors = {
  codeBlocks: "code",
  inputArea: "#input",
  messageBlocks: ".message",
  sendButton: ".send",
  stopButton: ".stop",
};

async function main(): Promise<void> {
  installBrowserGlobals();
  const { cancelAutoSend, triggerAutoSend } = await import("../src/modules/auto_send");
  const config = { autoSend: true, autoSendDelaySeconds: 5, hasFileUpload: false, requestKeys: ["request-1"] };
  const states: Array<AutoSendState | null> = [];
  const unsubscribe = subscribeAutoSendState((state) => states.push(state));
  assertEqual(states.at(-1), null, "idle auto-send exposed a pending state");

  const followUpInput = new FakeInput();
  const followUpHost: FakeFocusable = {
    focus: () => {fakeDocument.activeElement = followUpHost;},
    shadowRoot: { activeElement: followUpInput },
  };
  fakeDocument.activeElement = followUpHost;
  input.innerText = "message";
  const successfulSend = triggerAutoSend(config, SELECTORS);
  assertWaitingState(states.at(-1), 5000, false);
  assertEqual(input.sendAttempts, 0, "auto-send ran before the configured delay");
  flushNextTimer(5000);
  assertEqual(states.at(-1)?.phase, "sending", "elapsed countdown did not enter sending state");
  assertEqual(fakeDocument.activeElement, followUpInput, "auto-send did not restore follow-up input focus");
  flushNextTimer();
  assertEqual(await successfulSend, "sent", "successful send did not resolve as sent");
  assertEqual(inputListeners.size, 0, "successful send left an input listener");
  assertEqual(states.at(-1)?.phase, "sent", "successful send did not retain its final state");
  assertEqual(states.at(-1)?.requestKeys?.[0], "request-1", "send state lost its tool batch identity");

  input.innerText = "message";
  const cancelledSend = triggerAutoSend(config, SELECTORS);
  cancelAutoSend();
  assertEqual(await cancelledSend, "cancelled", "cancelled send did not resolve");
  assertEqual(timers.size, 0, "cancelled send left a retry timer");
  assertEqual(inputListeners.size, 0, "cancelled send left an input listener");
  assertEqual(states.at(-1)?.phase, "cancelled", "cancelled send did not retain its final state");

  const replacedSend = triggerAutoSend(config, SELECTORS);
  const replacementSend = triggerAutoSend(config, SELECTORS);
  assertEqual(await replacedSend, "cancelled", "superseded send was not cancelled");
  assertEqual(timers.size, 1, "superseding a send scheduled duplicate timers");
  assertEqual(inputListeners.size, 1, "superseding a send left duplicate input listeners");
  assertWaitingState(states.at(-1), 5000, false);
  cancelAutoSend();
  await replacementSend;

  const disabledPendingSend = triggerAutoSend(config, SELECTORS);

  assertEqual(
    await triggerAutoSend({ ...config, autoSend: false }, SELECTORS),
    "disabled",
    "disabled auto-send did not resolve"
  );
  assertEqual(await disabledPendingSend, "cancelled", "disabling left the previous send active");
  assertEqual(timers.size, 0, "disabled auto-send left a pending timer");
  assertEqual(states.at(-1)?.phase, "disabled", "disabled send did not retain its final state");

  input.clearOnSend = false;
  const delayedRetry = triggerAutoSend({ ...config, autoSendDelaySeconds: 30, hasFileUpload: true }, SELECTORS);
  flushNextTimer(30000);
  flushNextTimer(1200);
  assertWaitingState(states.at(-1), 30000, true);
  flushNextTimer(30000);
  cancelAutoSend();
  assertEqual(await delayedRetry, "cancelled", "upload retry could not be cancelled");

  const zeroDelay = triggerAutoSend({ ...config, autoSendDelaySeconds: 0 }, SELECTORS);
  assertEqual(states.at(-1)?.phase, "sending", "zero delay displayed an extra countdown");
  flushNextTimer(350);
  flushNextTimer(1200);
  flushNextTimer(1600);
  cancelAutoSend();
  await zeroDelay;
  input.clearOnSend = true;

  const editableSend = triggerAutoSend(config, SELECTORS);
  const sendAttemptsBeforeEdit = input.sendAttempts;
  dispatchInput(input, false);
  assertEqual(timers.size, 1, "synthetic input cancelled auto-send");
  dispatchInput(followUpInput, true);
  assertEqual(timers.size, 1, "editing the follow-up input cancelled the current send");
  input.innerText = "";
  dispatchInput(input, true);
  assertEqual(await editableSend, "cancelled", "clearing the input was mistaken for a successful send");
  assertEqual(timers.size, 0, "manual editing left a send timer");
  assertEqual(input.sendAttempts, sendAttemptsBeforeEdit, "manual editing dispatched a send");
  assertEqual(inputListeners.size, 0, "manual editing left an input listener");
  assertEqual(states.at(-1)?.phase, "cancelled", "manual editing did not retain the cancelled state");

  input.innerText = "message";
  const maximumDelay = triggerAutoSend({ ...config, autoSendDelaySeconds: 300 }, SELECTORS);
  flushNextTimer(300000);
  flushNextTimer();
  assertEqual(await maximumDelay, "sent", "maximum delay did not send");

  for (const delaySeconds of [-1, NaN, Infinity, 301]) {
    input.innerText = "message";
    const invalidDelay = triggerAutoSend({ ...config, autoSendDelaySeconds: delaySeconds }, SELECTORS);
    flushNextTimer(5000);
    flushNextTimer();
    assertEqual(await invalidDelay, "sent", "invalid delay did not fall back to the default");
  }
  for (const storedValue of [undefined, null, "30", {}, NaN, Infinity, -1, 301]) {
    assertEqual(normalizeAutoSendDelaySeconds(storedValue), 5, "invalid stored delay bypassed the default");
  }
  await verifySavedDelayChanges();
  cancelAutoSend();
  assertEqual(states.at(-1), null, "resetting an inactive send retained its previous state");
  unsubscribe();
}

function assertWaitingState(state: AutoSendState | null | undefined, waitMs: number, isRetry: boolean): void {
  if (state?.phase !== "waiting") {throw new Error("auto-send did not expose its countdown");}
  assertEqual(state.sendAt, now + waitMs, "countdown deadline did not match the scheduled send");
  assertEqual(state.isRetry, isRetry, "countdown did not distinguish send retries");
}

async function verifySavedDelayChanges(): Promise<void> {
  const stored: Record<string, unknown> = {};
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          get: (keys: string[]) => Promise.resolve(Object.fromEntries(keys.map((key) => [key, stored[key]]))),
        },
      },
    },
  });

  assertEqual(await loadAutoSendDelaySeconds(), 5, "missing saved delay did not use the default");
  for (const delaySeconds of [30, 0, 300, 5]) {
    stored[AUTO_SEND_DELAY_STORAGE_KEY] = delaySeconds;
    assertEqual(await loadAutoSendDelaySeconds(), delaySeconds, "the next send did not read the updated saved delay");
  }
}

function dispatchInput(target: FakeInput, isTrusted: boolean): void {
  const event = { isTrusted, composedPath: () => [target] } as unknown as Event;
  for (const listener of inputListeners) {listener(event);}
}

function installBrowserGlobals(): void {
  Date.now = () => now;
  class FakeKeyboardEvent extends Event {
    public readonly key: string;

    public constructor(type: string, init: KeyboardEventInit) {
      super(type, init);
      this.key = init.key ?? "";
    }
  }
  class FakeTextControl {}

  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "en-US" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      getComputedStyle: () => ({ display: "block", pointerEvents: "auto", visibility: "visible" }),
    },
  });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    configurable: true,
    value: FakeTextControl,
  });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    configurable: true,
    value: FakeTextControl,
  });
  Object.defineProperty(globalThis, "KeyboardEvent", {
    configurable: true,
    value: FakeKeyboardEvent,
  });
  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value: (handler: () => void, delayMs: number) => {
      const id = nextTimerId++;
      timers.set(id, { callback: handler, delayMs });
      return id;
    },
  });
  Object.defineProperty(globalThis, "clearTimeout", {
    configurable: true,
    value: (id: number) => timers.delete(id),
  });
}

function flushNextTimer(expectedDelayMs?: number): void {
  const entry = timers.entries().next().value;
  if (!entry) {throw new Error("missing scheduled auto-send timer");}
  if (expectedDelayMs !== undefined) {
    assertEqual(entry[1].delayMs, expectedDelayMs, "incorrect auto-send delay");
  }
  timers.delete(entry[0]);
  now += entry[1].delayMs;
  entry[1].callback();
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

void main();
