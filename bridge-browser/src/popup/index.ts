import { isMessageRequest, isStatusResponse, isSuccessResponse } from '../types';
import { createPopupTranslator, renderInstalledDescription, type PopupTranslator } from './i18n';

type PopupElements = {
  loadingView: HTMLElement;
  connectedView: HTMLElement;
  disconnectedView: HTMLElement;
  disconnectedStatusCard: HTMLElement;
  installCard: HTMLElement;
  suspendedHint: HTMLElement;
  expiredCard: HTMLElement;
  statusDot: HTMLElement;
  portDisplay: HTMLElement;
  manualInitBtn: HTMLButtonElement;
  autoSendInput: HTMLInputElement;
  autoApproveToolsInput: HTMLInputElement;
  showLogInput: HTMLInputElement;
  sessionPresetToggle: HTMLButtonElement;
  sessionPresetPanel: HTMLElement;
  defaultAutoApproveToolsInput: HTMLInputElement;
  title: HTMLElement;
  connectedText: HTMLElement;
  portLabel: HTMLElement;
  autoSendLabel: HTMLElement;
  autoApproveToolsLabel: HTMLElement;
  showLogLabel: HTMLElement;
  sessionPresetToggleLabel: HTMLElement;
  defaultAutoApproveToolsLabel: HTMLElement;
  sessionPresetHint: HTMLElement;
  checkingTitle: HTMLElement;
  disconnectedTitle: HTMLElement;
  expiredActionTitle: HTMLElement;
  expiredActionDesc: HTMLElement;
  installedTitle: HTMLElement;
  installedDesc: HTMLElement;
  notInstalledTitle: HTMLElement;
  marketplaceHint: HTMLElement;
};

type PopupContext = {
  elements: PopupElements;
  t: PopupTranslator;
};

type ManualInitStatusState = {
  resetTimer: ReturnType<typeof setTimeout> | null;
  token: number;
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
    showDisconnectedStatus(context);
    return;
  }

  listenForSessionSettingChanges(currentTabId, context.elements);
  requestCurrentStatus(currentTabId, context);
  bindPopupControls(currentTabId, context);
}

function createPopupContext(): PopupContext {
  return {
    elements: getPopupElements(),
    t: createPopupTranslator(),
  };
}

function getPopupElements(): PopupElements {
  return {
    loadingView: document.getElementById("loadingView") as HTMLElement,
    connectedView: document.getElementById("connectedView") as HTMLElement,
    disconnectedView: document.getElementById("disconnectedView") as HTMLElement,
    disconnectedStatusCard: document.getElementById("disconnectedStatusCard") as HTMLElement,
    installCard: document.getElementById("installCard") as HTMLElement,
    suspendedHint: document.getElementById("suspendedHint") as HTMLElement,
    expiredCard: document.getElementById("expiredCard") as HTMLElement,
    statusDot: document.getElementById("statusDot") as HTMLElement,
    portDisplay: document.getElementById("portDisplay") as HTMLElement,
    manualInitBtn: document.getElementById("manualInitBtn") as HTMLButtonElement,
    autoSendInput: document.getElementById("autoSend") as HTMLInputElement,
    autoApproveToolsInput: document.getElementById("autoApproveTools") as HTMLInputElement,
    showLogInput: document.getElementById("showLog") as HTMLInputElement,
    sessionPresetToggle: document.getElementById("sessionPresetToggle") as HTMLButtonElement,
    sessionPresetPanel: document.getElementById("sessionPresetPanel") as HTMLElement,
    defaultAutoApproveToolsInput: document.getElementById("defaultAutoApproveTools") as HTMLInputElement,
    title: document.getElementById("title") as HTMLElement,
    connectedText: document.getElementById("connectedText") as HTMLElement,
    portLabel: document.getElementById("portLabel") as HTMLElement,
    autoSendLabel: document.getElementById("autoSendLabel") as HTMLElement,
    autoApproveToolsLabel: document.getElementById("autoApproveToolsLabel") as HTMLElement,
    showLogLabel: document.getElementById("showLogLabel") as HTMLElement,
    sessionPresetToggleLabel: document.getElementById("sessionPresetToggleLabel") as HTMLElement,
    defaultAutoApproveToolsLabel: document.getElementById("defaultAutoApproveToolsLabel") as HTMLElement,
    sessionPresetHint: document.getElementById("sessionPresetHint") as HTMLElement,
    checkingTitle: document.getElementById("checkingTitle") as HTMLElement,
    disconnectedTitle: document.getElementById("disconnectedTitle") as HTMLElement,
    expiredActionTitle: document.getElementById("expiredActionTitle") as HTMLElement,
    expiredActionDesc: document.getElementById("expiredActionDesc") as HTMLElement,
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
  elements.sessionPresetToggleLabel.textContent = t("session_preset");
  elements.sessionPresetToggle.title = t("session_preset_title");
  elements.sessionPresetHint.textContent = t("session_preset_hint");
  elements.defaultAutoApproveToolsLabel.textContent = t("default_auto_approve_tools");
  elements.checkingTitle.textContent = t("checking_connection");
  elements.disconnectedTitle.textContent = t("disconnected");
  elements.suspendedHint.textContent = t("suspended_hint");
  elements.expiredActionTitle.textContent = t("expired_action_title");
  elements.expiredActionDesc.textContent = t("expired_action_desc");
  elements.installedTitle.textContent = t("installed_title");
  elements.installedDesc.innerHTML = renderInstalledDescription(t);
  elements.notInstalledTitle.textContent = t("not_installed_title");
  elements.marketplaceHint.textContent = t("marketplace_hint");
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
    if (isMessageRequest(request) && request.type === "DEFAULT_AUTO_APPROVE_TOOLS_CHANGED") {
      elements.defaultAutoApproveToolsInput.checked = request.defaultAutoApproveTools === true;
    }
  });
}

function requestCurrentStatus(currentTabId: number, context: PopupContext): void {
  chrome.runtime.sendMessage(
    { type: "GET_STATUS", tabId: currentTabId },
    (response: unknown) => {
      if (isStatusResponse(response) && response.connected) {
        showConnectedStatus(response, context.elements);
      } else if (isStatusResponse(response) && isExpiredDisconnectReason(response.disconnectReason)) {
        showExpiredStatus(context);
      } else if (isStatusResponse(response) && response.suspended === true) {
        showSuspendedStatus(context);
      } else {
        showDisconnectedStatus(context);
      }
    }
  );
}

function showConnectedStatus(
  response: {
    port?: number;
    showLog?: boolean;
    autoSend?: boolean;
    autoApproveTools?: boolean;
    defaultAutoApproveTools?: boolean;
  },
  elements: PopupElements
): void {
  elements.loadingView.classList.add("hidden");
  elements.connectedView.classList.remove("hidden");
  elements.disconnectedView.classList.add("hidden");
  elements.statusDot.classList.add("online");
  elements.statusDot.classList.remove("suspended", "expired");
  elements.portDisplay.innerText = String(response.port ?? "");
  elements.autoSendInput.checked = response.autoSend !== false;
  elements.autoApproveToolsInput.checked = response.autoApproveTools === true;
  elements.defaultAutoApproveToolsInput.checked = response.defaultAutoApproveTools === true;
  elements.showLogInput.checked = response.showLog === true;
}

function showSuspendedStatus(context: PopupContext): void {
  const { elements, t } = context;
  elements.loadingView.classList.add("hidden");
  elements.connectedView.classList.add("hidden");
  elements.disconnectedView.classList.remove("hidden");
  elements.statusDot.classList.remove("online", "expired");
  elements.statusDot.classList.add("suspended");
  elements.disconnectedStatusCard.classList.remove("disconnected", "expired");
  elements.disconnectedStatusCard.classList.add("suspended");
  elements.disconnectedTitle.classList.remove("disconnected", "expired");
  elements.disconnectedTitle.classList.add("suspended");
  elements.disconnectedTitle.textContent = t("suspended");
  elements.suspendedHint.classList.remove("hidden");
  elements.expiredCard.classList.add("hidden");
  elements.installCard.classList.add("hidden");
}

function showExpiredStatus(context: PopupContext): void {
  const { elements, t } = context;
  elements.loadingView.classList.add("hidden");
  elements.connectedView.classList.add("hidden");
  elements.disconnectedView.classList.remove("hidden");
  elements.statusDot.classList.remove("online", "suspended");
  elements.statusDot.classList.add("expired");
  elements.disconnectedStatusCard.classList.remove("disconnected", "suspended");
  elements.disconnectedStatusCard.classList.add("expired");
  elements.disconnectedTitle.classList.remove("disconnected", "suspended");
  elements.disconnectedTitle.classList.add("expired");
  elements.disconnectedTitle.textContent = t("connection_expired");
  elements.suspendedHint.classList.add("hidden");
  elements.expiredCard.classList.remove("hidden");
  elements.installCard.classList.add("hidden");
}

function showDisconnectedStatus(context: PopupContext): void {
  const { elements, t } = context;
  elements.loadingView.classList.add("hidden");
  elements.connectedView.classList.add("hidden");
  elements.statusDot.classList.remove("online", "suspended", "expired");
  elements.disconnectedStatusCard.classList.remove("suspended", "expired");
  elements.disconnectedStatusCard.classList.add("disconnected");
  elements.disconnectedTitle.classList.remove("suspended", "expired");
  elements.disconnectedTitle.classList.add("disconnected");
  elements.disconnectedTitle.textContent = t("disconnected");
  elements.suspendedHint.classList.add("hidden");
  elements.expiredCard.classList.add("hidden");
  elements.installCard.classList.remove("hidden");
  elements.disconnectedView.classList.remove("hidden");
}

function isExpiredDisconnectReason(reason: unknown): boolean {
  return reason === "gateway_unavailable" ||
    reason === "invalid_token" ||
    reason === "invalid_session";
}

function bindPopupControls(currentTabId: number, context: PopupContext): void {
  bindManualInitButton(currentTabId, context);
  bindSessionPresetToggle(context.elements);
  bindAutoSendToggle(currentTabId, context.elements.autoSendInput);
  bindAutoApproveToolsToggle(currentTabId, context.elements.autoApproveToolsInput);
  bindDefaultAutoApproveToolsToggle(context.elements.defaultAutoApproveToolsInput);
  bindLogToggle(currentTabId, context.elements.showLogInput);
}

function bindSessionPresetToggle(elements: PopupElements): void {
  elements.sessionPresetToggle.addEventListener("click", () => {
    const nextExpanded = elements.sessionPresetToggle.getAttribute("aria-expanded") !== "true";
    setSessionPresetPanelExpanded(elements, nextExpanded);
  });
}

function setSessionPresetPanelExpanded(elements: PopupElements, expanded: boolean): void {
  elements.sessionPresetToggle.setAttribute("aria-expanded", String(expanded));
  elements.sessionPresetPanel.classList.toggle("hidden", !expanded);
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

function bindDefaultAutoApproveToolsToggle(defaultAutoApproveToolsInput: HTMLInputElement): void {
  defaultAutoApproveToolsInput.addEventListener("change", () => {
    void chrome.runtime.sendMessage({
      type: "SET_DEFAULT_AUTO_APPROVE_TOOLS",
      defaultAutoApproveTools: defaultAutoApproveToolsInput.checked,
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
