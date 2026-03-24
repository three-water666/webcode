const els = {
  userRules: document.getElementById("userRules") as HTMLTextAreaElement,
  status: document.getElementById("status") as HTMLElement,
  currentLang: document.getElementById("currentLang") as HTMLElement,
  // UI Text Elements for i18n
  title: document.getElementById("title") as HTMLElement,
  sec_prompts: document.getElementById("sec_prompts") as HTMLElement,
  lbl_user_rules: document.getElementById("lbl_user_rules") as HTMLElement,
  desc_user_rules: document.getElementById("desc_user_rules") as HTMLElement,
  save: document.getElementById("save") as HTMLButtonElement,
  reset: document.getElementById("reset") as HTMLButtonElement,
};

// Determine language context
const lang = navigator.language.startsWith("zh") ? "zh" : "en";

// UI Strings
const UI: Record<string, Record<string, string>> = {
  en: {
    title: "WebMCP Settings",
    sec_prompts: "User Rules",
    lbl_user_rules: "Custom Preferences & Instructions",
    desc_user_rules:
      "Your personal requirements (e.g., 'Always ask before coding'). These instructions will be appended to the AI's system prompt in all connected workspaces.",
    save: "Save Settings",
    reset: "Clear Config",
    saved: "Settings saved successfully!",
    reset_confirm:
      "Are you sure you want to clear your rules?",
    restored: "Config cleared.",
  },
  zh: {
    title: "WebMCP 设置",
    sec_prompts: "用户自定义规则",
    lbl_user_rules: "个性化指令与偏好",
    desc_user_rules: "你的个性化要求（如“写代码前先确认方案”）。该指令会自动追加到所有工作区的 AI 系统提示词中。",
    save: "保存设置",
    reset: "清空配置",
    saved: "设置已成功保存！",
    reset_confirm: "确定要清空自定义用户提示词吗？",
    restored: "已清空配置。",
  },
};

function t(key: string): string {
  return UI[lang][key] || UI.en[key];
}

// Apply UI Text
function initUI() {
  els.currentLang.textContent = lang.toUpperCase();
  els.title.textContent = t("title");
  els.sec_prompts.textContent = t("sec_prompts");
  els.lbl_user_rules.textContent = t("lbl_user_rules");
  els.desc_user_rules.textContent = t("desc_user_rules");
  els.save.textContent = t("save");
  els.reset.textContent = t("reset");
}

function showStatus(msg: string, type = "success") {
  els.status.textContent = msg;
  els.status.className = type === "success" ? "status-success" : "status-error";
  setTimeout(() => {
    els.status.textContent = "";
    els.status.className = "";
  }, 3000);
}

async function restoreOptions() {
  // Load user overrides from sync storage
  chrome.storage.sync.get(["user_rules"], (items) => {
    els.userRules.value = items.user_rules || "";
  });
}

function saveOptions() {
  chrome.storage.sync.set({
    user_rules: els.userRules.value
  }, () => {
    showStatus(t("saved"), "success");
  });
}

async function resetOptions() {
  if (confirm(t("reset_confirm"))) {
    els.userRules.value = "";
    saveOptions();
    showStatus(t("restored"));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  restoreOptions();
});
els.save.addEventListener("click", saveOptions);
els.reset.addEventListener("click", resetOptions);
