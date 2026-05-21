import { i18n } from "../modules/i18n";

const lang = i18n.lang;

export const promptStorageKeys = {
  prompt: lang === "zh" ? "prompt_zh" : "prompt_en",
  train: lang === "zh" ? "train_zh" : "train_en",
  error: lang === "zh" ? "error_hint_zh" : "error_hint_en",
  init: lang === "zh" ? "init_zh" : "init_en",
  oversize: lang === "zh" ? "oversize_zh" : "oversize_en",
} as const;

const promptStorageKeyList = Object.values(promptStorageKeys);

export function loadPromptsFromStorage(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(promptStorageKeyList, (items: Record<string, unknown>) => {
      const prompt = readStorageString(items, promptStorageKeys.prompt);
      const train = readStorageString(items, promptStorageKeys.train);
      const error = readStorageString(items, promptStorageKeys.error);
      const init = readStorageString(items, promptStorageKeys.init);
      const oversize = readStorageString(items, promptStorageKeys.oversize);

      if (prompt) { i18n.resources.prompt = prompt; }
      if (train) { i18n.resources.train = train; }
      if (error) { i18n.resources.error = error; }
      if (init) { i18n.resources.init = init; }
      if (oversize) { i18n.resources.oversize = oversize; }
      resolve();
    });
  });
}

export function hasPromptResourceChange(changes: Record<string, chrome.storage.StorageChange>): boolean {
  return promptStorageKeyList.some((key) => Boolean(changes[key]));
}

function readStorageString(items: Record<string, unknown>, key: string): string | undefined {
  const value = items[key];
  return typeof value === "string" && value ? value : undefined;
}
