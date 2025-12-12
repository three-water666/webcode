import { DEFAULT_SELECTORS } from '../modules/config';
import { Session } from '../types';

const els = {
  selectors: document.getElementById("selectorsJson") as HTMLTextAreaElement,
  initPrompt: document.getElementById("initPrompt") as HTMLTextAreaElement,
  trainPrompt: document.getElementById("trainPrompt") as HTMLTextAreaElement,
  errorPrompt: document.getElementById("errorPrompt") as HTMLTextAreaElement,
  userRules: document.getElementById("userRules") as HTMLTextAreaElement,
  status: document.getElementById("status") as HTMLElement,
  currentLang: document.getElementById("currentLang") as HTMLElement,
  // UI Text Elements for i18n
  title: document.getElementById("title") as HTMLElement,
  sec_selectors: document.getElementById("sec_selectors") as HTMLElement,
  desc_selectors: document.getElementById("desc_selectors") as HTMLElement,
  sec_prompts: document.getElementById("sec_prompts") as HTMLElement,
  lbl_init_prompt: document.getElementById("lbl_init_prompt") as HTMLElement,
  desc_init_prompt: document.getElementById("desc_init_prompt") as HTMLElement,
  lbl_user_rules: document.getElementById("lbl_user_rules") as HTMLElement,
  desc_user_rules: document.getElementById("desc_user_rules") as HTMLElement,
  lbl_train_prompt: document.getElementById("lbl_train_prompt") as HTMLElement,
  desc_train_prompt: document.getElementById("desc_train_prompt") as HTMLElement,
  lbl_error_prompt: document.getElementById("lbl_error_prompt") as HTMLElement,
  desc_error_prompt: document.getElementById("desc_error_prompt") as HTMLElement,
  // HITL
  sec_hitl: document.getElementById("sec_hitl") as HTMLElement,
  desc_hitl: document.getElementById("desc_hitl") as HTMLElement,
  refreshTools: document.getElementById("refreshTools") as HTMLButtonElement,
  toolList: document.getElementById("toolList") as HTMLElement,
  save: document.getElementById("save") as HTMLButtonElement,
  reset: document.getElementById("reset") as HTMLButtonElement,
  btnImport: document.getElementById("btnImport") as HTMLButtonElement,
  btnExport: document.getElementById("btnExport") as HTMLButtonElement,
  importFile: document.getElementById("importFile") as HTMLInputElement,
};

// Determine language context
const lang = navigator.language.startsWith("zh") ? "zh" : "en";

// UI Strings
const UI: Record<string, Record<string, string>> = {
  en: {
    title: "WebMCP Settings",
    sec_selectors: "Site Selectors",
    desc_selectors:
      "Customize DOM selectors. Only modify if the extension stops working.",
    sec_prompts: "System Prompts",
    lbl_init_prompt: "Initial System Prompt",
    desc_init_prompt:
      "Sent to AI when you start a new conversation. (Supports Markdown)",
    lbl_user_rules: "User Rules (Custom Preferences)",
    desc_user_rules:
      "Your personal requirements (e.g., 'Always ask before coding'). Appended to System & Training prompts.",
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
    saved_sync: "Settings saved & synced to VS Code!",
    saved_local: "Saved locally (VS Code disconnected).",
    reset_confirm:
      "Are you sure you want to reset ALL settings (Selectors & Prompts) to defaults?",
    error_json: "Error: Invalid JSON format in Selectors.",
    restored: "Restored defaults from files.",
    btn_import: "Import Config",
    btn_export: "Export Config",
    import_success: "Configuration imported successfully!",
    import_error: "Import failed: Invalid JSON or structure.",
    refresh_ok: "Tool list updated!",
    refresh_fail: "Failed to connect to Gateway. Ensure VS Code is running."
  },
  zh: {
    title: "WebMCP 设置",
    sec_selectors: "站点选择器配置",
    desc_selectors: "自定义 DOM 选择器。仅在插件无法识别网页元素时修改。",
    sec_prompts: "系统提示词 (Prompt)",
    lbl_init_prompt: "初始系统提示词",
    desc_init_prompt: "开启新会话时自动发送给 AI 的指令 (支持 Markdown)。",
    lbl_user_rules: "用户自定义规则 (User Rules)",
    desc_user_rules: "你的个性化要求（如“写代码前先确认方案”）。会自动追加到系统提示词和训练提示后。",
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
    saved_sync: "设置已同步至 VS Code！",
    saved_local: "已保存至本地 (VS Code 未连接)。",
    reset_confirm: "确定要重置所有设置（选择器和提示词）为默认值吗？",
    error_json: "错误：选择器配置 JSON 格式无效。",
    restored: "已从文件恢复默认设置。",
    refresh_ok: "工具列表已更新！",
    refresh_fail: "连接网关失败，请确保 VS Code 正在运行。",
    btn_import: "导入配置",
    btn_export: "导出配置",
    import_success: "配置导入成功！",
    import_error: "导入失败：JSON 格式错误或结构无效。",
  },
};

function t(key: string): string {
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
  els.lbl_user_rules.textContent = t("lbl_user_rules");
  els.desc_user_rules.textContent = t("desc_user_rules");
  els.lbl_train_prompt.textContent = t("lbl_train_prompt");
  els.desc_train_prompt.textContent = t("desc_train_prompt");
  els.lbl_error_prompt.textContent = t("lbl_error_prompt");
  els.desc_error_prompt.textContent = t("desc_error_prompt");
  els.sec_hitl.textContent = t("sec_hitl");
  els.desc_hitl.textContent = t("desc_hitl");
  els.save.textContent = t("save");
  els.reset.textContent = t("reset");
  els.btnImport.textContent = t("btn_import");
  els.btnExport.textContent = t("btn_export");
}

function showStatus(msg: string, type = "success") {
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
async function fetchDefault(filename: string): Promise<string> {
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
        tools.forEach((toolName: string) => {
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
    [KEY_PROMPT, KEY_TRAIN, KEY_ERROR, "user_rules"],
    async (items) => {
      // User Rules
      els.userRules.value = items.user_rules || "";
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
    if (
      !config.deepseek ||
      !config.chatgpt ||
      !config.gemini ||
      !config.aistudio
    ) {
      throw new Error("Missing required platform keys");
    }
  } catch (e: any) {
    showStatus(t("error_json") + " " + e.message, "error");
    return;
  }

  // HITL Save
  const checkboxes = els.toolList.querySelectorAll('input[type="checkbox"]');
  const protectedTools: string[] = [];
  checkboxes.forEach((cb) => {
    if ((cb as HTMLInputElement).checked) protectedTools.push((cb as HTMLInputElement).value);
  });

  chrome.storage.sync.set({
    customSelectors: config,
    protected_tools: protectedTools,
  });

  const data: Record<string, string> = {};
  data[KEY_PROMPT] = els.initPrompt.value;
  data[KEY_TRAIN] = els.trainPrompt.value;
  data[KEY_ERROR] = els.errorPrompt.value;
  data["user_rules"] = els.userRules.value;

  chrome.storage.local.set(data, () => {
    // [Host Sync] Check sync status
    chrome.runtime.sendMessage({ type: "SYNC_CONFIG" }, (response) => {
        if (response && response.success) {
            showStatus(t("saved_sync"), "success");
        } else {
            // Warn user that config is local-only
            showStatus(t("saved_local"), "error");
        }
    });
  });
}

async function fetchTools() {
  try {
    const all = await chrome.storage.local.get(null);
    let port = null,
      token = null;

    // Find first active session
    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith("session_") && (val as Session).port && (val as Session).token) {
        port = (val as Session).port;
        token = (val as Session).token;
        break;
      }
    }

    if (!port || !token) throw new Error("No active session found");

    const resp = await fetch(`http://127.0.0.1:${port}/v1/tools`, {
      headers: { "X-WebMCP-Token": token },
    });

    if (!resp.ok) throw new Error("Gateway rejected request");
    const data = await resp.json();
    const newToolNames = data.tools.map((t: any) => t.name);

    // [HITL] Security: Auto-protect new tools logic (Sync with content.js)
    const localData = await chrome.storage.local.get(["cached_tool_list"]);
    const syncData = await chrome.storage.sync.get(["protected_tools"]);

    const knownTools = new Set(localData.cached_tool_list || []);
    const protectedTools = new Set(syncData.protected_tools || []);
    let protectedDirty = false;

    newToolNames.forEach((tName: string) => {
      // If it's a NEW tool (not in cache), protect it by default
      if (!knownTools.has(tName)) {
        if (!protectedTools.has(tName)) {
          protectedTools.add(tName);
          protectedDirty = true;
        }
      }
    });

    if (protectedDirty) {
      await chrome.storage.sync.set({
        protected_tools: Array.from(protectedTools),
      });
    }

    await chrome.storage.local.set({ cached_tool_list: newToolNames });
    await restoreOptions(); // Re-render
    showStatus(t("refresh_ok"));
  } catch (e) {
    console.error(e);
    showStatus(t("refresh_fail"), "error");
  }
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
els.refreshTools.addEventListener("click", fetchTools);

// Export Config
els.btnExport.addEventListener("click", () => {
  chrome.storage.sync.get(
    ["customSelectors", "protected_tools"],
    (syncData) => {
      // Export all possible local prompt keys to be safe
      const localKeys = [
        "prompt_en",
        "prompt_zh",
        "train_en",
        "train_zh",
        "error_en",
        "error_zh",
      ];
      chrome.storage.local.get(localKeys, (localData) => {
        const config = {
          version: 1,
          timestamp: new Date().toISOString(),
          sync: syncData,
          local: localData,
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `webmcp-config-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  );
});

// Import Config
els.btnImport.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (!target.files) return;
  const file = target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const result = e.target?.result as string;
      const config = JSON.parse(result);
      if (!config.sync || !config.local) throw new Error("Invalid structure");

      chrome.storage.sync.set(config.sync, () => {
        chrome.storage.local.set(config.local, () => {
          restoreOptions();
          showStatus(t("import_success"));
        });
      });
    } catch (err) {
      console.error(err);
      showStatus(t("import_error"), "error");
    }
  };
  reader.readAsText(file);
  target.value = "";
});