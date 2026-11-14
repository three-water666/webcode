import type { SiteSelectors } from "../src/modules/config";
import type { FollowUpQueueSnapshot } from "../src/content/follow_up_queue";
import { normalizeAutoSendDelaySeconds } from "@webcode/shared";
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
let inputAvailable = true;
const fakeDocument: {
  activeElement: FakeFocusable | null;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
  execCommand: () => boolean;
  querySelector: () => null;
  querySelectorAll: (selector: string) => FakeInput[];
} = {
  activeElement: input,
  addEventListener: (_type, listener) => inputListeners.add(listener),
  removeEventListener: (_type, listener) => inputListeners.delete(listener),
  execCommand: () => false,
  querySelector: () => null,
  querySelectorAll: (selector: string) => selector === "#input" && inputAvailable ? [input] : [],
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
    flushNextTimer(350);
    flushNextTimer();
    assertEqual(await invalidDelay, "sent", "invalid delay did not fall back to the default");
  }
  for (const configuredValue of [undefined, null, "30", {}, NaN, Infinity, -1, 301]) {
    assertEqual(normalizeAutoSendDelaySeconds(configuredValue), 0, "invalid delay added an unexpected wait");
  }
  await testFollowUpQueueHandoff();
  cancelAutoSend();
  assertEqual(states.at(-1), null, "resetting an inactive send retained its previous state");
  unsubscribe();
}

async function testFollowUpQueueHandoff(): Promise<void> {
  const { ResultDeliveryController } = await import("../src/content/result_delivery_controller");
  const { FollowUpQueue } = await import("../src/content/follow_up_queue");
  const { ToolRequestRegistry } = await import("../src/content/tool_request_registry");
  const { ToolActivityTracker } = await import("../src/content/tool_activity");
  const queue = new FollowUpQueue();
  const registry = new ToolRequestRegistry();
  let snapshot: FollowUpQueueSnapshot = { items: [] };
  queue.subscribe((state) => {snapshot = state;});
  const controller = new ResultDeliveryController({
    getAutoSend: () => true,
    getAutoSendDelaySeconds: () => 5,
    followUpQueue: queue,
    hasPendingTurns: () => false,
    requestRegistry: registry,
    scheduleMainLoop: () => undefined,
    toolActivityTracker: new ToolActivityTracker(),
  });

  input.innerText = "";
  queue.confirm("first follow-up");
  controller.deliverFollowUps(SELECTORS);
  flushNextTimer(120);
  await settleDelivery();
  assertEqual(snapshot.items.length, 0, "written follow-up remained queued during the countdown");
  assertEqual(input.innerText.includes("first follow-up"), true, "follow-up was not written to the chat input");

  queue.confirm("later follow-up");
  input.innerText += "\nuser edit";
  dispatchInput(input, true);
  await settleDelivery();
  assertEqual(snapshot.items.length, 1, "editing requeued the written follow-up or removed a later follow-up");
  assertEqual(input.innerText.includes("user edit"), true, "cancelling auto-send discarded the user's edit");
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  assertEqual(input.innerText, "", "manual send did not clear the input");

  controller.deliverFollowUps(SELECTORS);
  flushNextTimer(120);
  await settleDelivery();
  assertEqual(input.innerText.includes("first follow-up"), false, "next response repeated a manually sent follow-up");
  assertEqual(input.innerText.includes("later follow-up"), true, "next response lost the later follow-up");
  flushNextTimer(5000);
  flushNextTimer(1200);
  await settleDelivery();

  queue.confirm("tool follow-up");
  registry.saveRawResult("tool-1", "first tool result");
  controller.deliver(registry.buildBufferedResultBatch(["tool-1"]), SELECTORS);
  flushNextTimer(120);
  await settleDelivery();
  flushNextTimer(120);
  await settleDelivery();
  assertEqual(snapshot.items.length, 0, "follow-up appended to tool results remained queued");
  assertEqual(input.innerText.includes("first tool result"), true, "tool result was lost during follow-up delivery");
  assertEqual(input.innerText.includes("tool follow-up"), true, "tool delivery did not append the follow-up");
  input.innerText += "\nuser edit";
  dispatchInput(input, true);
  await settleDelivery();
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

  registry.saveRawResult("tool-2", "second tool result");
  controller.deliver(registry.buildBufferedResultBatch(["tool-2"]), SELECTORS);
  flushNextTimer(120);
  await settleDelivery();
  assertEqual(input.innerText.includes("tool follow-up"), false, "next tool result repeated a manually sent follow-up");
  flushNextTimer(5000);
  flushNextTimer(1200);
  await settleDelivery();

  queue.confirm("retry follow-up");
  inputAvailable = false;
  controller.deliverFollowUps(SELECTORS);
  await settleDelivery();
  assertEqual(snapshot.items.length, 1, "failed input write discarded the follow-up");
  assertEqual(snapshot.items[0]?.status, "confirmed", "failed input write did not restore the waiting state");
  assertEqual(timers.size, 0, "failed input write still scheduled auto-send");

  inputAvailable = true;
  controller.deliverFollowUps(SELECTORS);
  flushNextTimer(120);
  await settleDelivery();
  assertEqual(snapshot.items.length, 0, "successful retry did not remove the written follow-up");
  assertEqual(input.innerText.includes("retry follow-up"), true, "failed follow-up could not be retried");
  dispatchInput(input, true);
  await settleDelivery();
  assertEqual(snapshot.items.length, 0, "editing after a successful retry requeued the follow-up");
}

function settleDelivery(): Promise<void> {
  return new Promise((resolve) => {setImmediate(resolve);});
}

function assertWaitingState(state: AutoSendState | null | undefined, waitMs: number, isRetry: boolean): void {
  if (state?.phase !== "waiting") {throw new Error("auto-send did not expose its countdown");}
  assertEqual(state.sendAt, now + waitMs, "countdown deadline did not match the scheduled send");
  assertEqual(state.isRetry, isRetry, "countdown did not distinguish send retries");
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
