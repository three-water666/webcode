// options.js

const els = {
  selectors: document.getElementById("selectorsJson"),
  initPrompt: document.getElementById("initPrompt"),
  trainPrompt: document.getElementById("trainPrompt"),
  errorPrompt: document.getElementById("errorPrompt"), // New
  status: document.getElementById("status"),
  currentLang: document.getElementById("currentLang"),
  // UI Text Elements for i18n
  title: document.getElementById("title"),
  sec_selectors: document.getElementById("sec_selectors"),
  desc_selectors: document.getElementById("desc_selectors"),
  sec_prompts: document.getElementById("sec_prompts"),
  lbl_init_prompt: document.getElementById("lbl_init_prompt"),
  desc_init_prompt: document.getElementById("desc_init_prompt"),
  lbl_train_prompt: document.getElementById("lbl_train_prompt"),
  desc_train_prompt: document.getElementById("desc_train_prompt"),
  lbl_error_prompt: document.getElementById("lbl_error_prompt"),
  desc_error_prompt: document.getElementById("desc_error_prompt"),
  // HITL
  sec_hitl: document.getElementById("sec_hitl"),
  desc_hitl: document.getElementById("desc_hitl"),
  toolList: document.getElementById("toolList"),
  save: document.getElementById("save"),
  reset: document.getElementById("reset"),
};

// Determine language context
const lang = navigator.language.startsWith("zh") ? "zh" : "en";

// UI Strings
const UI = {
  en: {
    title: "WebMCP Settings",
    sec_selectors: "Site Selectors",
    desc_selectors:
      "Customize DOM selectors. Only modify if the extension stops working.",
    sec_prompts: "System Prompts",
    lbl_init_prompt: "Initial System Prompt",
    desc_init_prompt:
      "Sent to AI when you start a new conversation. (Supports Markdown)",
    lbl_train_prompt: "Training Hint (Periodic)",
    desc_train_prompt:
      "Inserted periodically (every 5 tool calls) to remind AI of the protocol.",
    lbl_error_prompt: "Format Error Hint",
    desc_error_prompt:
      "Sent to AI when it generates invalid JSON or fails to follow protocol.",
    sec_hitl: "Human-in-the-Loop (Approval)",
    desc_hitl:
      "Select tools that require manual approval before execution. (Connect to Gateway first to populate list)",
    save: "Save Settings",
    reset: "Reset to Defaults",
    saved: "Settings saved successfully!",
    reset_confirm:
      "Are you sure you want to reset ALL settings (Selectors & Prompts) to defaults?",
    error_json: "Error: Invalid JSON format in Selectors.",
    restored: "Restored defaults from files.",
  },
  zh: {
    title: "WebMCP 设置",
    sec_selectors: "站点选择器配置",
    desc_selectors: "自定义 DOM 选择器。仅在插件无法识别网页元素时修改。",
    sec_prompts: "系统提示词 (Prompt)",
    lbl_init_prompt: "初始系统提示词",
    desc_init_prompt: "开启新会话时自动发送给 AI 的指令 (支持 Markdown)。",
    lbl_train_prompt: "周期性训练提示",
    desc_train_prompt: "每隔 5 次工具调用插入一次，用于强化 AI 对协议的记忆。",
    lbl_error_prompt: "格式错误警告",
    desc_error_prompt: "当 AI 生成的 JSON 无效或违反协议时，自动发送此警告。",
    sec_hitl: "人工确认设置 (HITL)",
    desc_hitl:
      "选择需要人工批准才能执行的工具。（请先连接一次网关以获取工具列表）",
    save: "保存设置",
    reset: "恢复默认设置",
    saved: "设置已成功保存！",
    reset_confirm: "确定要重置所有设置（选择器和提示词）为默认值吗？",
    error_json: "错误：选择器配置 JSON 格式无效。",
    restored: "已从文件恢复默认设置。",
  },
};

function t(key) {
  return UI[lang][key] || UI.en[key];
}

// Apply UI Text
function initUI() {
  els.currentLang.textContent = lang.toUpperCase();
  els.title.textContent = t("title");
  els.sec_selectors.textContent = t("sec_selectors");
  els.desc_selectors.textContent = t("desc_selectors");
  els.sec_prompts.textContent = t("sec_prompts");
  els.lbl_init_prompt.textContent = t("lbl_init_prompt");
  els.desc_init_prompt.textContent = t("desc_init_prompt");
  els.lbl_train_prompt.textContent = t("lbl_train_prompt");
  els.desc_train_prompt.textContent = t("desc_train_prompt");
  els.lbl_error_prompt.textContent = t("lbl_error_prompt");
  els.desc_error_prompt.textContent = t("desc_error_prompt");
  els.sec_hitl.textContent = t("sec_hitl");
  els.desc_hitl.textContent = t("desc_hitl");
  els.save.textContent = t("save");
  els.reset.textContent = t("reset");
}

function showStatus(msg, type = "success") {
  els.status.textContent = msg;
  els.status.className = type === "success" ? "status-success" : "status-error";
  setTimeout(() => {
    els.status.textContent = "";
    els.status.className = "";
  }, 3000);
}

// Keys for storage
const KEY_PROMPT = lang === "zh" ? "prompt_zh" : "prompt_en";
const KEY_TRAIN = lang === "zh" ? "train_zh" : "train_en";
const KEY_ERROR = lang === "zh" ? "error_zh" : "error_en";

// Helper to fetch text from extension files
async function fetchDefault(filename) {
  try {
    const url = chrome.runtime.getURL(filename);
    const resp = await fetch(url);
    return await resp.text();
  } catch (e) {
    console.error("Failed to fetch default:", filename, e);
    return "";
  }
}

async function restoreOptions() {
  chrome.storage.sync.get(["customSelectors", "protected_tools"], (items) => {
    const config = items.customSelectors || DEFAULT_SELECTORS;
    els.selectors.value = JSON.stringify(config, null, 2);

    // HITL: Render Tool List
    const protectedTools = new Set(items.protected_tools || []);
    chrome.storage.local.get(["cached_tool_list"], (localItems) => {
      const tools = localItems.cached_tool_list || [];
      const container = els.toolList;

      if (tools.length > 0) {
        container.innerHTML = "";
        tools.forEach((toolName) => {
          const div = document.createElement("div");
          div.style.marginBottom = "5px";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.id = "tool_" + toolName;
          checkbox.value = toolName;
          checkbox.checked = protectedTools.has(toolName);

          const label = document.createElement("label");
          label.htmlFor = "tool_" + toolName;
          label.style.display = "inline";
          label.style.marginLeft = "8px";
          label.style.fontWeight = "normal";
          label.textContent = toolName;

          div.appendChild(checkbox);
          div.appendChild(label);
          container.appendChild(div);
        });
      }
    });
  });

  chrome.storage.local.get(
    [KEY_PROMPT, KEY_TRAIN, KEY_ERROR],
    async (items) => {
      // Prompt
      if (items[KEY_PROMPT]) els.initPrompt.value = items[KEY_PROMPT];
      else
        els.initPrompt.value = await fetchDefault(
          lang === "zh" ? "prompt_zh.md" : "prompt.md"
        );

      // Train
      if (items[KEY_TRAIN]) els.trainPrompt.value = items[KEY_TRAIN];
      else
        els.trainPrompt.value = await fetchDefault(
          lang === "zh" ? "train_zh.md" : "train.md"
        );

      // Error
      if (items[KEY_ERROR]) els.errorPrompt.value = items[KEY_ERROR];
      else
        els.errorPrompt.value = await fetchDefault(
          lang === "zh" ? "error_hint_zh.md" : "error_hint.md"
        );
    }
  );
}

function saveOptions() {
  const jsonString = els.selectors.value;
  let config;
  try {
    config = JSON.parse(jsonString);
    if (!config.deepseek || !config.chatgpt || !config.gemini) {
      throw new Error("Missing required platform keys");
    }
  } catch (e) {
    showStatus(t("error_json") + " " + e.message, "error");
    return;
  }

  // HITL Save
  const checkboxes = els.toolList.querySelectorAll('input[type="checkbox"]');
  const protectedTools = [];
  checkboxes.forEach((cb) => {
    if (cb.checked) protectedTools.push(cb.value);
  });

  chrome.storage.sync.set({
    customSelectors: config,
    protected_tools: protectedTools,
  });

  const data = {};
  data[KEY_PROMPT] = els.initPrompt.value;
  data[KEY_TRAIN] = els.trainPrompt.value;
  data[KEY_ERROR] = els.errorPrompt.value;

  chrome.storage.local.set(data, () => {
    showStatus(t("saved"));
  });
}

async function resetOptions() {
  if (confirm(t("reset_confirm"))) {
    els.selectors.value = JSON.stringify(DEFAULT_SELECTORS, null, 2);

    const promptFile = lang === "zh" ? "prompt_zh.md" : "prompt.md";
    const trainFile = lang === "zh" ? "train_zh.md" : "train.md";
    const errorFile = lang === "zh" ? "error_hint_zh.md" : "error_hint.md";

    els.initPrompt.value = await fetchDefault(promptFile);
    els.trainPrompt.value = await fetchDefault(trainFile);
    els.errorPrompt.value = await fetchDefault(errorFile);

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
