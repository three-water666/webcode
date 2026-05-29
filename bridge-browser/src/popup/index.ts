import { BRANDING } from '@webcode/shared';
import { isMessageRequest, isStatusResponse, isStoredSession, isSuccessResponse } from '../types';

type PopupElements = {
  connectedView: HTMLElement;
  disconnectedView: HTMLElement;
  statusDot: HTMLElement;
  portDisplay: HTMLElement;
  copyInitBtn: HTMLButtonElement;
  autoSendInput: HTMLInputElement;
  showLogInput: HTMLInputElement;
  availableView: HTMLElement;
  gatewayList: HTMLElement;
  title: HTMLElement;
  connectedText: HTMLElement;
  portLabel: HTMLElement;
  autoSendLabel: HTMLElement;
  showLogLabel: HTMLElement;
  availableGateways: HTMLElement;
  disconnectedTitle: HTMLElement;
  installedTitle: HTMLElement;
  installedDesc: HTMLElement;
  notInstalledTitle: HTMLElement;
  marketplaceHint: HTMLElement;
};

type PopupContext = {
  elements: PopupElements;
  initKey: string;
  t: (key: string) => string;
};

type GatewaySession = {
  port: number;
  token: string;
};

const UI: Record<string, Record<string, string>> = {
  en: {
    title: BRANDING.bridgeName,
    connected_text: "✅ Connected to VS Code",
    port_label: "Port",
    copy_init: "Copy Initialization Prompt",
    copy_init_title: "Copy the initialization prompt",
    auto_send: "Auto Send Message",
    show_log: "Show Floating Log",
    available_gateways: "⚡ Available Gateways",
    disconnected: "🔴 Disconnected",
    installed_title: "👉 Already Installed?",
    installed_desc: `Click ${BRANDING.productName} in the VS Code status bar (bottom right) and follow the steps to launch.`,
    not_installed_title: "👉 Not Installed?",
    marketplace_hint: "Search in VS Code Marketplace:",
    connect_to: "Connect to",
    copied_init: "Initialization prompt copied",
    init_missing: "Init Prompt Not Found",
  },
  zh: {
    title: BRANDING.bridgeName,
    connected_text: "✅ 已连接到 VS Code",
    port_label: "端口",
    copy_init: "复制初始化提示词",
    copy_init_title: "复制初始化提示词",
    auto_send: "自动发送消息",
    show_log: "显示悬浮日志",
    available_gateways: "⚡ 可用网关",
    disconnected: "🔴 未连接",
    installed_title: "👉 已安装？",
    installed_desc: `点击 VS Code 右下角状态栏中的 ${BRANDING.productName}，并按提示启动服务。`,
    not_installed_title: "👉 未安装？",
    marketplace_hint: "在 VS Code 扩展市场中搜索：",
    connect_to: "连接到",
    copied_init: "初始化提示词已复制",
    init_missing: "未找到初始化提示词",
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
  requestCurrentStatus(currentTab, currentTabId, context);
  bindPopupControls(currentTabId, context);
}

function createPopupContext(): PopupContext {
  const lang = navigator.language.startsWith("zh") ? "zh" : "en";
  const t = (key: string) => UI[lang][key] || UI.en[key];

  return {
    elements: getPopupElements(),
    initKey: lang === "zh" ? "init_zh" : "init_en",
    t,
  };
}

function getPopupElements(): PopupElements {
  return {
    connectedView: document.getElementById("connectedView") as HTMLElement,
    disconnectedView: document.getElementById("disconnectedView") as HTMLElement,
    statusDot: document.getElementById("statusDot") as HTMLElement,
    portDisplay: document.getElementById("portDisplay") as HTMLElement,
    copyInitBtn: document.getElementById("copyInitBtn") as HTMLButtonElement,
    autoSendInput: document.getElementById("autoSend") as HTMLInputElement,
    showLogInput: document.getElementById("showLog") as HTMLInputElement,
    availableView: document.getElementById("availableView") as HTMLElement,
    gatewayList: document.getElementById("gatewayList") as HTMLElement,
    title: document.getElementById("title") as HTMLElement,
    connectedText: document.getElementById("connectedText") as HTMLElement,
    portLabel: document.getElementById("portLabel") as HTMLElement,
    autoSendLabel: document.getElementById("autoSendLabel") as HTMLElement,
    showLogLabel: document.getElementById("showLogLabel") as HTMLElement,
    availableGateways: document.getElementById("availableGateways") as HTMLElement,
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
  elements.copyInitBtn.textContent = t("copy_init");
  elements.copyInitBtn.title = t("copy_init_title");
  elements.autoSendLabel.textContent = t("auto_send");
  elements.showLogLabel.textContent = t("show_log");
  elements.availableGateways.innerHTML = `<span>⚡</span> ${t("available_gateways").replace(/^⚡\s*/, "")}`;
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

function requestCurrentStatus(currentTab: chrome.tabs.Tab, currentTabId: number, context: PopupContext): void {
  chrome.runtime.sendMessage(
    { type: "GET_STATUS", tabId: currentTabId },
    (response: unknown) => {
      if (isStatusResponse(response) && response.connected) {
        showConnectedStatus(response, context.elements);
      } else {
        showDisconnectedStatus(currentTab.url ?? "", currentTabId, context);
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

function showDisconnectedStatus(currentUrl: string, currentTabId: number, context: PopupContext): void {
  context.elements.connectedView.classList.add("hidden");
  context.elements.statusDot.classList.remove("online");

  if (!isManualAttachUrl(currentUrl)) {
    showNoAvailableGateways(context.elements);
    return;
  }

  chrome.storage.local.get(null, (items: Record<string, unknown>) => {
    renderAvailableGateways(collectStoredGateways(items), currentUrl, currentTabId, context);
  });
}

function isManualAttachUrl(currentUrl: string): boolean {
  return currentUrl.startsWith('http://127.0.0.1:') ||
    currentUrl.startsWith('http://localhost:') ||
    currentUrl.startsWith('https://') ||
    currentUrl.startsWith('http://');
}

function collectStoredGateways(items: Record<string, unknown>): GatewaySession[] {
  const uniqueGateways = new Map<number, string>();
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith("session_") && isStoredSession(value)) {
      uniqueGateways.set(value.port, value.token);
    }
  }

  return Array.from(uniqueGateways, ([port, token]) => ({ port, token }));
}

function renderAvailableGateways(
  gateways: GatewaySession[],
  currentUrl: string,
  currentTabId: number,
  context: PopupContext
): void {
  if (gateways.length === 0) {
    showNoAvailableGateways(context.elements);
    return;
  }

  context.elements.availableView.classList.remove("hidden");
  context.elements.disconnectedView.classList.add("hidden");
  context.elements.gatewayList.innerHTML = "";
  for (const gateway of gateways) {
    context.elements.gatewayList.appendChild(createGatewayButton(gateway, currentUrl, currentTabId, context.t));
  }
}

function showNoAvailableGateways(elements: PopupElements): void {
  elements.availableView.classList.add("hidden");
  elements.disconnectedView.classList.remove("hidden");
}

function createGatewayButton(
  gateway: GatewaySession,
  currentUrl: string,
  currentTabId: number,
  t: PopupContext["t"]
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "btn";
  button.style.marginBottom = "8px";
  button.style.display = "flex";
  button.style.justifyContent = "space-between";
  button.innerHTML = `<span>🔗 ${t("connect_to")} <b>${gateway.port}</b></span> <span>⚡</span>`;
  button.onclick = () => {
    connectExistingGateway(gateway, currentUrl, currentTabId);
  };
  return button;
}

function connectExistingGateway(gateway: GatewaySession, currentUrl: string, currentTabId: number): void {
  chrome.runtime.sendMessage(
    {
      type: "CONNECT_EXISTING",
      port: gateway.port,
      token: gateway.token,
      tabId: currentTabId,
      targetOrigin: getTargetOrigin(currentUrl),
    },
    (response: unknown) => {
      if (isSuccessResponse(response) && response.success) {
        window.close();
      }
    }
  );
}

function getTargetOrigin(currentUrl: string): string | undefined {
  try {
    return new URL(currentUrl).origin;
  } catch {
    return undefined;
  }
}

function bindPopupControls(currentTabId: number, context: PopupContext): void {
  bindCopyInitButton(context);
  bindAutoSendToggle(context.elements.autoSendInput);
  bindLogToggle(currentTabId, context.elements.showLogInput);
}

function bindCopyInitButton(context: PopupContext): void {
  context.elements.copyInitBtn.addEventListener("click", () => {
    chrome.storage.local.get([context.initKey], (items: Record<string, unknown>) => {
      handleStoredInitPrompt(items[context.initKey], context);
    });
  });
}

function handleStoredInitPrompt(initContent: unknown, context: PopupContext): void {
  if (typeof initContent !== "string" || !initContent) {
    context.elements.copyInitBtn.innerText = context.t("init_missing");
    return;
  }

  void copyInitPrompt(initContent, context);
}

async function copyInitPrompt(initContent: string, context: PopupContext): Promise<void> {
  try {
    await navigator.clipboard.writeText(initContent);
    showCopySuccess(context);
  } catch {
    context.elements.copyInitBtn.innerText = context.t("init_missing");
  }
}

function showCopySuccess(context: PopupContext): void {
  const originalText = context.elements.copyInitBtn.innerText;
  context.elements.copyInitBtn.innerText = context.t("copied_init");
  context.elements.copyInitBtn.style.backgroundColor = "#0d8a6a";
  setTimeout(() => {
    context.elements.copyInitBtn.innerText = originalText;
    context.elements.copyInitBtn.style.backgroundColor = "";
  }, 3000);
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
