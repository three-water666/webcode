import {
  AUTO_SEND_DELAY_STORAGE_KEY,
  DEFAULT_AUTO_SEND_DELAY_SECONDS,
  MAX_AUTO_SEND_DELAY_SECONDS,
  loadAutoSendDelaySeconds,
  normalizeAutoSendDelaySeconds,
} from "../modules/auto_send_settings";
import type { PopupTranslator } from "./i18n";

export async function initializeAutoSendDelayControl(t: PopupTranslator): Promise<void> {
  const input = document.getElementById("autoSendDelay") as HTMLInputElement;
  const label = document.getElementById("autoSendDelayLabel") as HTMLElement;
  const hint = document.getElementById("autoSendDelayHint") as HTMLElement;
  label.textContent = t("auto_send_delay");
  hint.textContent = t("auto_send_delay_hint");
  input.min = "0";
  input.max = String(MAX_AUTO_SEND_DELAY_SECONDS);
  input.value = String(DEFAULT_AUTO_SEND_DELAY_SECONDS);
  input.disabled = true;

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes[AUTO_SEND_DELAY_STORAGE_KEY]) {
      input.value = String(normalizeAutoSendDelaySeconds(changes[AUTO_SEND_DELAY_STORAGE_KEY].newValue as unknown));
    }
  });

  try {
    input.value = String(await loadAutoSendDelaySeconds());
    input.disabled = false;
  } catch {
    hint.textContent = t("auto_send_delay_load_failed");
    return;
  }

  input.addEventListener("input", () => input.setCustomValidity(""));
  input.addEventListener("change", async () => {
    if (!input.reportValidity()) {return;}
    try {
      await chrome.storage.local.set({ [AUTO_SEND_DELAY_STORAGE_KEY]: input.valueAsNumber });
    } catch {
      input.setCustomValidity(t("auto_send_delay_save_failed"));
      input.reportValidity();
    }
  });
}
