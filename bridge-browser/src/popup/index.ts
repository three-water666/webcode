import { BRANDING } from '@webcode/shared';
import { isMessageRequest, isStatusResponse, isSuccessResponse } from '../types';

type PopupElements = {
  connectedView: HTMLElement;
  disconnectedView: HTMLElement;
  disconnectedStatusCard: HTMLElement;
  installCard: HTMLElement;
  suspendedHint: HTMLElement;
  statusDot: HTMLElement;
  portDisplay: HTMLElement;
  manualInitBtn: HTMLButtonElement;
  autoSendInput: HTMLInputElement;
  autoApproveToolsInput: HTMLInputElement;
  showLogInput: HTMLInputElement;
  title: HTMLElement;
  connectedText: HTMLElement;
  portLabel: HTMLElement;
  autoSendLabel: HTMLElement;
  autoApproveToolsLabel: HTMLElement;
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
    auto_approve_tools: "Auto-Approve Tools",
    show_log: "Show Floating Log",
    disconnected: "🔴 Disconnected from VS Code",
    suspended: "⏸️ Connection paused on this page",
    suspended_hint: "Return to the connected site to resume automatically. Local tools stay disabled here.",
    installed_title: "VS Code extension installed?",
    installed_desc: `Click ${BRANDING.productName} in the VS Code status bar (bottom right) and follow the steps to launch.`,
    not_installed_title: "VS Code extension not installed?",
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
    auto_approve_tools: "所有工具无需审批",
    show_log: "显示悬浮日志",
    disconnected: "🔴 未连接到 VS Code",
    suspended: "⏸️ 当前页面连接已暂停",
    suspended_hint: "回到已连接的网站后会自动恢复；本页面无法调用本地工具。",
    installed_title: "VS Code 插件已安装？",
    installed_desc: `点击 VS Code 右下角状态栏中的 ${BRANDING.productName}，并按提示启动服务。`,
    not_installed_title: "VS Code 插件未安装？",
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

  listenForSessionSettingChanges(currentTabId, context.elements);
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
    disconnectedStatusCard: document.getElementById("disconnectedStatusCard") as HTMLElement,
    installCard: document.getElementById("installCard") as HTMLElement,
    suspendedHint: document.getElementById("suspendedHint") as HTMLElement,
    statusDot: document.getElementById("statusDot") as HTMLElement,
    portDisplay: document.getElementById("portDisplay") as HTMLElement,
    manualInitBtn: document.getElementById("manualInitBtn") as HTMLButtonElement,
    autoSendInput: document.getElementById("autoSend") as HTMLInputElement,
    autoApproveToolsInput: document.getElementById("autoApproveTools") as HTMLInputElement,
    showLogInput: document.getElementById("showLog") as HTMLInputElement,
    title: document.getElementById("title") as HTMLElement,
    connectedText: document.getElementById("connectedText") as HTMLElement,
    portLabel: document.getElementById("portLabel") as HTMLElement,
    autoSendLabel: document.getElementById("autoSendLabel") as HTMLElement,
    autoApproveToolsLabel: document.getElementById("autoApproveToolsLabel") as HTMLElement,
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
  elements.autoApproveToolsLabel.textContent = t("auto_approve_tools");
  elements.showLogLabel.textContent = t("show_log");
  elements.disconnectedTitle.textContent = t("disconnected");
  elements.suspendedHint.textContent = t("suspended_hint");
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

function listenForSessionSettingChanges(currentTabId: number, elements: PopupElements): void {
  chrome.runtime.onMessage.addListener((request: unknown) => {
    if (isMessageRequest(request) && request.type === "LOG_VISIBLE_CHANGED" && request.tabId === currentTabId) {
      elements.showLogInput.checked = request.show === true;
    }
    if (isMessageRequest(request) && request.type === "AUTO_SEND_CHANGED" && request.tabId === currentTabId) {
      elements.autoSendInput.checked = request.autoSend !== false;
    }
    if (
      isMessageRequest(request) &&
      request.type === "AUTO_APPROVE_TOOLS_CHANGED" &&
      request.tabId === currentTabId
    ) {
      elements.autoApproveToolsInput.checked = request.autoApproveTools === true;
    }
  });
}

function requestCurrentStatus(currentTabId: number, context: PopupContext): void {
  chrome.runtime.sendMessage(
    { type: "GET_STATUS", tabId: currentTabId },
    (response: unknown) => {
      if (isStatusResponse(response) && response.connected) {
        showConnectedStatus(response, context.elements);
      } else if (isStatusResponse(response) && response.suspended === true) {
        showSuspendedStatus(context);
      } else {
        showDisconnectedStatus(context);
      }
    }
  );
}

function showConnectedStatus(
  response: { port?: number; showLog?: boolean; autoSend?: boolean; autoApproveTools?: boolean },
  elements: PopupElements
): void {
  elements.connectedView.classList.remove("hidden");
  elements.disconnectedView.classList.add("hidden");
  elements.statusDot.classList.add("online");
  elements.statusDot.classList.remove("suspended");
  elements.portDisplay.innerText = String(response.port ?? "");
  elements.autoSendInput.checked = response.autoSend !== false;
  elements.autoApproveToolsInput.checked = response.autoApproveTools === true;
  elements.showLogInput.checked = response.showLog === true;
}

function showSuspendedStatus(context: PopupContext): void {
  const { elements, t } = context;
  elements.connectedView.classList.add("hidden");
  elements.disconnectedView.classList.remove("hidden");
  elements.statusDot.classList.remove("online");
  elements.statusDot.classList.add("suspended");
  elements.disconnectedStatusCard.classList.remove("disconnected");
  elements.disconnectedStatusCard.classList.add("suspended");
  elements.disconnectedTitle.classList.remove("disconnected");
  elements.disconnectedTitle.classList.add("suspended");
  elements.disconnectedTitle.textContent = t("suspended");
  elements.suspendedHint.classList.remove("hidden");
  elements.installCard.classList.add("hidden");
}

function showDisconnectedStatus(context: PopupContext): void {
  const { elements, t } = context;
  elements.connectedView.classList.add("hidden");
  elements.statusDot.classList.remove("online", "suspended");
  elements.disconnectedStatusCard.classList.remove("suspended");
  elements.disconnectedStatusCard.classList.add("disconnected");
  elements.disconnectedTitle.classList.remove("suspended");
  elements.disconnectedTitle.classList.add("disconnected");
  elements.disconnectedTitle.textContent = t("disconnected");
  elements.suspendedHint.classList.add("hidden");
  elements.installCard.classList.remove("hidden");
  elements.disconnectedView.classList.remove("hidden");
}

function bindPopupControls(currentTabId: number, context: PopupContext): void {
  bindManualInitButton(currentTabId, context);
  bindAutoSendToggle(currentTabId, context.elements.autoSendInput);
  bindAutoApproveToolsToggle(currentTabId, context.elements.autoApproveToolsInput);
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

function bindAutoSendToggle(currentTabId: number, autoSendInput: HTMLInputElement): void {
  autoSendInput.addEventListener("change", () => {
    void chrome.runtime.sendMessage({
      type: "SET_AUTO_SEND",
      tabId: currentTabId,
      autoSend: autoSendInput.checked,
    });
  });
}

function bindAutoApproveToolsToggle(
  currentTabId: number,
  autoApproveToolsInput: HTMLInputElement
): void {
  autoApproveToolsInput.addEventListener("change", () => {
    void chrome.runtime.sendMessage({
      type: "SET_AUTO_APPROVE_TOOLS",
      tabId: currentTabId,
      autoApproveTools: autoApproveToolsInput.checked,
    });
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
