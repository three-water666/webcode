import { BRANDING } from '@webcode/shared';
import { isMessageRequest, isStatusResponse, isSuccessResponse } from '../types';

type PopupElements = {
  connectedView: HTMLElement;
  disconnectedView: HTMLElement;
  statusDot: HTMLElement;
  portDisplay: HTMLElement;
  manualInitBtn: HTMLButtonElement;
  autoSendInput: HTMLInputElement;
  showLogInput: HTMLInputElement;
  title: HTMLElement;
  connectedText: HTMLElement;
  portLabel: HTMLElement;
  autoSendLabel: HTMLElement;
  showLogLabel: HTMLElement;
  disconnectedTitle: HTMLElement;
  installedTitle: HTMLElement;
  installedDesc: HTMLElement;
  notInstalledTitle: HTMLElement;
  marketplaceHint: HTMLElement;
};

type PopupContext = {
  elements: PopupElements;
  t: (key: string) => string;
};

type ManualInitStatusState = {
  resetTimer: ReturnType<typeof setTimeout> | null;
  token: number;
};

const UI: Record<string, Record<string, string>> = {
  en: {
    title: BRANDING.bridgeName,
    connected_text: "✅ Connected to VS Code",
    port_label: "Port",
    manual_init: "Manual Initialization",
    manual_init_title: "Add initialization context to the current input",
    manual_init_running: "Initializing...",
    manual_init_done: "Initialization added",
    manual_init_attached: "Initialization attached",
    manual_init_failed: "Initialization failed",
    manual_init_unavailable: "Cannot initialize here",
    auto_send: "Auto Send Message",
    show_log: "Show Floating Log",
    disconnected: "🔴 Disconnected",
    installed_title: "👉 Already Installed?",
    installed_desc: `Click ${BRANDING.productName} in the VS Code status bar (bottom right) and follow the steps to launch.`,
    not_installed_title: "👉 Not Installed?",
    marketplace_hint: "Search in VS Code Marketplace:",
  },
  zh: {
    title: BRANDING.bridgeName,
    connected_text: "✅ 已连接到 VS Code",
    port_label: "端口",
    manual_init: "手动初始化",
    manual_init_title: "将初始化上下文追加到当前输入框",
    manual_init_running: "初始化中...",
    manual_init_done: "初始化上下文已添加",
    manual_init_attached: "初始化上下文已作为 txt 附件添加",
    manual_init_failed: "初始化失败",
    manual_init_unavailable: "当前页面无法初始化",
    auto_send: "自动发送消息",
    show_log: "显示悬浮日志",
    disconnected: "🔴 未连接",
    installed_title: "👉 已安装？",
    installed_desc: `点击 VS Code 右下角状态栏中的 ${BRANDING.productName}，并按提示启动服务。`,
    not_installed_title: "👉 未安装？",
    marketplace_hint: "在 VS Code 扩展市场中搜索：",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  void initializePopup();
});

async function initializePopup(): Promise<void> {
  const context = createPopupContext();
  initializeLabels(context);

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  const currentTabId = currentTab?.id;
  if (!currentTabId) {
    return;
  }

  listenForLogVisibilityChanges(currentTabId, context.elements);
  requestCurrentStatus(currentTabId, context);
  bindPopupControls(currentTabId, context);
}

function createPopupContext(): PopupContext {
  const lang = navigator.language.startsWith("zh") ? "zh" : "en";
  const t = (key: string) => UI[lang][key] || UI.en[key];

  return {
    elements: getPopupElements(),
    t,
  };
}

function getPopupElements(): PopupElements {
  return {
    connectedView: document.getElementById("connectedView") as HTMLElement,
    disconnectedView: document.getElementById("disconnectedView") as HTMLElement,
    statusDot: document.getElementById("statusDot") as HTMLElement,
    portDisplay: document.getElementById("portDisplay") as HTMLElement,
    manualInitBtn: document.getElementById("manualInitBtn") as HTMLButtonElement,
    autoSendInput: document.getElementById("autoSend") as HTMLInputElement,
    showLogInput: document.getElementById("showLog") as HTMLInputElement,
    title: document.getElementById("title") as HTMLElement,
    connectedText: document.getElementById("connectedText") as HTMLElement,
    portLabel: document.getElementById("portLabel") as HTMLElement,
    autoSendLabel: document.getElementById("autoSendLabel") as HTMLElement,
    showLogLabel: document.getElementById("showLogLabel") as HTMLElement,
    disconnectedTitle: document.getElementById("disconnectedTitle") as HTMLElement,
    installedTitle: document.getElementById("installedTitle") as HTMLElement,
    installedDesc: document.getElementById("installedDesc") as HTMLElement,
    notInstalledTitle: document.getElementById("notInstalledTitle") as HTMLElement,
    marketplaceHint: document.getElementById("marketplaceHint") as HTMLElement,
  };
}

function initializeLabels(context: PopupContext): void {
  const { elements, t } = context;
  elements.title.textContent = t("title");
  elements.connectedText.textContent = t("connected_text");
  elements.portLabel.textContent = t("port_label");
  elements.manualInitBtn.textContent = t("manual_init");
  elements.manualInitBtn.title = t("manual_init_title");
  elements.autoSendLabel.textContent = t("auto_send");
  elements.showLogLabel.textContent = t("show_log");
  elements.disconnectedTitle.textContent = t("disconnected");
  elements.installedTitle.textContent = t("installed_title");
  elements.installedDesc.innerHTML = renderInstalledDescription(t);
  elements.notInstalledTitle.textContent = t("not_installed_title");
  elements.marketplaceHint.textContent = t("marketplace_hint");
}

function renderInstalledDescription(t: PopupContext["t"]): string {
  return t("installed_desc").replace(
    BRANDING.productName,
    `<span style="color: #3498db; font-weight: bold">${BRANDING.productName}</span>`
  );
}

function listenForLogVisibilityChanges(currentTabId: number, elements: PopupElements): void {
  chrome.runtime.onMessage.addListener((request: unknown) => {
    if (isMessageRequest(request) && request.type === "LOG_VISIBLE_CHANGED" && request.tabId === currentTabId) {
      elements.showLogInput.checked = request.show === true;
    }
  });
}

function requestCurrentStatus(currentTabId: number, context: PopupContext): void {
  chrome.runtime.sendMessage(
    { type: "GET_STATUS", tabId: currentTabId },
    (response: unknown) => {
      if (isStatusResponse(response) && response.connected) {
        showConnectedStatus(response, context.elements);
      } else {
        showDisconnectedStatus(context.elements);
      }
    }
  );
}

function showConnectedStatus(response: { port?: number; showLog?: boolean }, elements: PopupElements): void {
  elements.connectedView.classList.remove("hidden");
  elements.disconnectedView.classList.add("hidden");
  elements.statusDot.classList.add("online");
  elements.portDisplay.innerText = String(response.port ?? "");
  elements.showLogInput.checked = response.showLog === true;
}

function showDisconnectedStatus(elements: PopupElements): void {
  elements.connectedView.classList.add("hidden");
  elements.statusDot.classList.remove("online");
  elements.disconnectedView.classList.remove("hidden");
}

function bindPopupControls(currentTabId: number, context: PopupContext): void {
  bindManualInitButton(currentTabId, context);
  bindAutoSendToggle(context.elements.autoSendInput);
  bindLogToggle(currentTabId, context.elements.showLogInput);
}

function bindManualInitButton(currentTabId: number, context: PopupContext): void {
  const statusState: ManualInitStatusState = {
    resetTimer: null,
    token: 0,
  };

  context.elements.manualInitBtn.addEventListener("click", () => {
    const token = startManualInitStatus(context, statusState);

    chrome.tabs.sendMessage(currentTabId, { type: "MANUAL_INIT" }, (response: unknown) => {
      if (chrome.runtime.lastError) {
        showManualInitStatus(context, statusState, token, "manual_init_unavailable", false);
        return;
      }

      if (isSuccessResponse(response) && response.success) {
        const labelKey = isAttachedResponse(response) ? "manual_init_attached" : "manual_init_done";
        showManualInitStatus(context, statusState, token, labelKey, true);
        return;
      }

      showManualInitStatus(context, statusState, token, "manual_init_failed", false);
    });
  });
}

function startManualInitStatus(context: PopupContext, state: ManualInitStatusState): number {
  state.token += 1;
  clearManualInitStatusTimer(state);

  const button = context.elements.manualInitBtn;
  button.disabled = true;
  button.innerText = context.t("manual_init_running");
  button.style.backgroundColor = "";

  return state.token;
}

function isAttachedResponse(response: unknown): boolean {
  return typeof response === "object" &&
    response !== null &&
    "attached" in response &&
    (response as { attached?: unknown }).attached === true;
}

function showManualInitStatus(
  context: PopupContext,
  state: ManualInitStatusState,
  token: number,
  labelKey: string,
  success: boolean
): void {
  if (token !== state.token) {return;}
  clearManualInitStatusTimer(state);

  const button = context.elements.manualInitBtn;
  button.disabled = false;
  button.innerText = context.t(labelKey);
  button.style.backgroundColor = success ? "#0d8a6a" : "#8a3d3d";

  state.resetTimer = setTimeout(() => {
    if (token !== state.token) {return;}
    button.innerText = context.t("manual_init");
    button.style.backgroundColor = "";
    state.resetTimer = null;
  }, 3000);
}

function clearManualInitStatusTimer(state: ManualInitStatusState): void {
  if (!state.resetTimer) {return;}
  clearTimeout(state.resetTimer);
  state.resetTimer = null;
}

function bindAutoSendToggle(autoSendInput: HTMLInputElement): void {
  chrome.storage.sync.get(["autoSend"], (items: Record<string, unknown>) => {
    autoSendInput.checked = typeof items.autoSend === "boolean" ? items.autoSend : true;
  });
  autoSendInput.addEventListener("change", () => {
    void chrome.storage.sync.set({ autoSend: autoSendInput.checked });
  });
}

function bindLogToggle(currentTabId: number, showLogInput: HTMLInputElement): void {
  showLogInput.addEventListener("change", () => {
    void chrome.runtime.sendMessage({
      type: "SET_LOG_VISIBLE",
      tabId: currentTabId,
      show: showLogInput.checked,
    });
  });
}
