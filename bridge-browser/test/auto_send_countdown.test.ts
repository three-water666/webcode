import { FollowUpQueue } from "../src/content/follow_up_queue";
import { ToolActivityTracker } from "../src/content/tool_activity";
import { setAutoSendState } from "../src/modules/auto_send_state";
import { fakeDocument, type FakeElement, installOverlayBrowserGlobals } from "./support/fake_overlay_dom";

const intervals = new Map<number, () => void>();
let nextIntervalId = 1;
let now = 10000;

async function main(): Promise<void> {
  installOverlayBrowserGlobals();
  Date.now = () => now;
  Object.defineProperty(globalThis, "setInterval", {
    configurable: true,
    value: (callback: () => void) => {
      const id = nextIntervalId++;
      intervals.set(id, callback);
      return id;
    },
  });
  Object.defineProperty(globalThis, "clearInterval", {
    configurable: true, value: (id: number) => intervals.delete(id),
  });

  const { ToolActivityOverlay } = await import("../src/content/tool_activity_overlay");
  const { i18n } = await import("../src/modules/i18n");
  const tracker = new ToolActivityTracker();
  const overlay = new ToolActivityOverlay(tracker, new FollowUpQueue());
  overlay.setEnabled(true);
  const host = fakeDocument.body.children.at(-1)!;
  const launcher = getRequired(host.shadowRoot!, ".launcher");
  const panel = getRequired(host.shadowRoot!, ".panel");
  const banner = getRequired(panel, ".work-status");
  const label = getRequired(panel, ".work-status-label");
  const requestKeys = ["request-1"];
  tracker.capture({ identity: { requestKey: "request-1" }, payload: { name: "read_file" }, source: "dom", turnId: "turn-1" });
  assertIncludes(label.getText(), "Running tools", "initial capture flashed a separate processing stage");
  tracker.updateStatus({ requestKey: "request-1" }, "queued");
  assertIncludes(label.getText(), "Running tools", "queueing flashed a separate processing stage");
  tracker.updateStatus({ requestKey: "request-1" }, "executing");
  const header = getRequired(panel, ".header");
  const list = getRequired(panel, ".list");
  advanceTime(1000);
  assertEqual(getRequired(panel, ".header"), header, "elapsed time rebuilt the panel header");
  assertEqual(getRequired(panel, ".list"), list, "elapsed time rebuilt the tool list");
  tracker.updateStatus({ requestKey: "request-1" }, "succeeded");
  setAutoSendState({ phase: "preparing", requestKeys });
  tracker.updateDelivery(requestKeys, "delivering");
  tracker.updateDelivery(requestKeys, "delivered");
  assertIncludes(label.getText(), "Returning results", "input write completion prematurely changed the work stage");

  setAutoSendState({ phase: "waiting", sendAt: now + 5000, isRetry: false, requestKeys });
  assertIncludes(launcher.getText(), "Sending in 5s", "collapsed panel omitted the countdown");
  assertEqual(host.className, "", "countdown forced the panel open");
  advanceTime(2200);
  assertIncludes(launcher.getText(), "Sending in 3s", "countdown did not use the actual remaining time");
  launcher.click();
  assertIncludes(banner.getText(), "Sending in 3s", "expanded panel omitted the countdown");
  assertIncludes(banner.getText(), "Edit the chat input", "countdown omitted the cancellation hint");

  getRequired(panel, ".follow-up-toggle").click();
  const textarea = getRequired(panel, "textarea");
  textarea.value = "keep this draft";
  textarea.focus();
  advanceTime(1000);
  const waitingHeader = getRequired(panel, ".header");
  const waitingList = getRequired(panel, ".list");
  advanceTime(0);
  assertEqual(getRequired(panel, ".header"), waitingHeader, "countdown rebuilt the panel header");
  assertEqual(getRequired(panel, ".list"), waitingList, "countdown rebuilt the tool list");
  assertEqual(getRequired(panel, ".work-status-label"), label, "countdown replaced the status label");
  assertEqual(getRequired(panel, "textarea"), textarea, "countdown replaced the follow-up input");
  assertEqual(textarea.value, "keep this draft", "countdown cleared the follow-up draft");
  assertEqual(fakeDocument.activeElement, textarea, "countdown moved input focus");
  assertIncludes(banner.getText(), "Sending in 2s", "expanded countdown stopped updating");

  i18n.lang = "zh";
  advanceTime(0);
  assertIncludes(banner.getText(), "2 秒后自动发送", "countdown was not localized");
  i18n.lang = "en";
  advanceTime(10000);
  assertIncludes(banner.getText(), "Sending...", "expired countdown displayed a stale remaining time");

  setAutoSendState({ phase: "sending", requestKeys });
  assertIncludes(launcher.getText(), "Sending...", "sending state was missing from the launcher");
  assertEqual(intervals.size, 0, "sending state kept the countdown ticker running");
  assertEqual(getRequired(panel, ".close").disabled, true, "pending send could be dismissed as completed");
  setAutoSendState({ phase: "sent", requestKeys });
  tracker.updateDelivery(requestKeys, "delivered");
  assertEqual(label.getText(), "Sent", "completed send regressed to the result-return stage");
  assertEqual(getRequired(panel, ".close").disabled, false, "completed send could not be dismissed");
  setAutoSendState({ phase: "waiting", sendAt: now + 30000, isRetry: true, requestKeys });
  assertIncludes(banner.getText(), "Retrying send in 30s", "retry did not restart the countdown");
  getRequired(panel, ".collapse").click();
  advanceTime(1000);
  assertIncludes(launcher.getText(), "Retrying send in 29s", "folding the panel stopped the retry countdown");
  setAutoSendState({ phase: "cancelled", requestKeys });
  assertIncludes(launcher.getText(), "Auto-send cancelled", "cancelled send regressed to result-return status");
  assertIncludes(banner.getText(), "manual sending", "cancelled send omitted the manual-send explanation");
  assertEqual(intervals.size, 0, "finished send leaked a countdown ticker");

  tracker.capture({ identity: { requestKey: "request-2" }, payload: { name: "write_file" }, source: "dom", turnId: "turn-1" });
  assertEqual(label.getText(), "Running tools", "additional tools reused a finished delivery stage");
  tracker.updateStatus({ requestKey: "request-2" }, "succeeded");
  setAutoSendState({ phase: "waiting", sendAt: now + 5000, isRetry: false, requestKeys });
  assertEqual(label.getText(), "Returning results", "an earlier batch overwrote later results from the same turn");
  tracker.updateDelivery(["request-2"], "delivered");
  setAutoSendState({ phase: "waiting", sendAt: now + 5000, isRetry: false, requestKeys: ["request-2"] });
  assertIncludes(label.getText(), "Sending in 5s", "a later batch in the same turn lost its countdown");
  tracker.capture({ identity: { requestKey: "request-3" }, payload: { name: "read_file" }, source: "dom", turnId: "turn-2" });
  assertEqual(label.getText(), "Running tools", "previous send overwrote a newer tool turn");
  assertIncludes(getRequired(panel, ".summary").getText(), "Tools: 0/1", "header repeated the changing work stage");
  assertEqual(intervals.size, 0, "a stale send kept a countdown ticker running");
  tracker.reset();
  setAutoSendState(null);
  assertEqual(banner.style.display, "none", "reset retained a work status");
  overlay.setEnabled(false);
  setAutoSendState({ phase: "waiting", sendAt: now + 5000, isRetry: false });
  assertEqual(host.style.display, "block", "send without tool history hid the countdown");
  setAutoSendState(null);
  assertEqual(host.style.display, "none", "clearing the countdown left an inactive panel visible");
  console.log("PASS ordered work stages, scoped countdowns, stable DOM, and follow-up focus");
}

function advanceTime(milliseconds: number): void {
  now += milliseconds;
  Array.from(intervals.values()).forEach((callback) => callback());
}

function getRequired(root: FakeElement, selector: string): FakeElement {
  const element = root.querySelector<FakeElement>(selector);
  if (!element) {throw new Error(`missing element ${selector}`);}
  return element;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);}
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {throw new Error(`${message}: expected '${actual}' to include '${expected}'`);}
}

void main();
