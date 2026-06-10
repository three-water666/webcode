import { t } from "../modules/i18n";
import { Logger } from "../modules/logger";
import * as UI from "../modules/ui";
import { type SiteSelectors } from "../modules/config";
import { BRANDING, PROTOCOL } from "@webcode/shared";
import { getSyncedAiSites, isMessageRequest, isSiteSelectors, isStatusResponse, type MessageRequest, type StatusResponse, type SyncedAiSite } from "../types";
import { AutoInitPromptController } from "./auto_init_prompt";
import { createApprovalState, parseStoredApprovalEntries, type ApprovalState } from "./approval_policy";
import { CompletionNotifier } from "./completion_notifier";
import { PageTurnStateMachine } from "./page_turn_state";
import { hasPromptResourceChange, loadPromptsFromStorage } from "./prompt_resources";
import { SendIntentObserver } from "./send_intent_observer";
import { ToolTurnCoordinator } from "./tool_turn_coordinator";
import { type BufferedResultBatch, ToolRequestRegistry } from "./tool_request_registry";

// === 配置与状态 ===
interface ConfigState {
  pollInterval: number;
  autoSend: boolean;
}

const CONFIG: ConfigState = {
  pollInterval: 1000,
  autoSend: true,
};

const OBSERVED_STATE_ATTRIBUTES = [
  "aria-busy",
  "aria-disabled",
  "aria-hidden",
  "aria-label",
  "class",
  "data-disabled",
  "data-loading",
  "data-state",
  "data-test-id",
  "data-testid",
  "data-visible",
  "disabled",
  "hidden",
  "inert",
  "style",
  "title",
];

// [State] Connection Guard
let isClientConnected = false;
let currentWorkspaceId = "global";

let approvalState: ApprovalState = createApprovalState();

function loadWorkspaceData(workspaceId: string): Promise<void> {
  return new Promise((resolve) => {
    const storageKey = `allowed_tools_${workspaceId}`;
    chrome.storage.local.get([storageKey], (localItems: Record<string, unknown>) => {
      approvalState = parseStoredApprovalEntries(localItems[storageKey]);
      resolve();
    });
  });
}

// Initially load prompts from local storage in case we are already connected
void loadPromptsFromStorage();
// Load default workspace data
void loadWorkspaceData(currentWorkspaceId);

type RuntimeSendResponse = (response?: unknown) => void;

// === DOM 选择器与配置 ===
let DOM: SiteSelectors | null = null;
let currentSiteName: string | null = null;
let currentSiteId: string | null = null;

// 监听消息 (日志开关 & 状态同步)
chrome.runtime.onMessage.addListener((request: unknown, _sender, sendResponse): boolean | void => (
  handleRuntimeMessage(request, sendResponse)
));

function handleRuntimeMessage(request: unknown, sendResponse: RuntimeSendResponse): boolean | void {
  if (!isMessageRequest(request)) {return;}

  if (request.type === "MANUAL_INIT") {
    void handleManualInitRequest(sendResponse);
    return true;
  }

  if (request.type === "TOGGLE_LOG") {
    const show = request.show === true;
    Logger.toggle(show);
    Logger.log("Logger Visible: " + show, "info");
  }
  if (request.type === "STATUS_UPDATE") {
    handleStatusUpdate(request);
  }
}

function handleStatusUpdate(request: MessageRequest): void {
  const wasConnected = isClientConnected;
  const wasWorkspaceId = currentWorkspaceId;
  const wasSiteId = currentSiteId;

  isClientConnected = request.connected === true;
  if (typeof request.workspaceId === "string") {
    currentWorkspaceId = request.workspaceId;
  }
  if (typeof request.siteId === "string") {
    currentSiteId = request.siteId;
  }

  if (!isClientConnected) {
    resetCurrentSite();
  }

  if (isClientConnected !== wasConnected) {
    Logger.log(`[MCP] Connection Status: ${isClientConnected ? "Connected" : "Disconnected"}`, "info");
  }

  if (isClientConnected && currentSiteId !== wasSiteId) {
    initDOMConfig();
  }

  if (isClientConnected && (isClientConnected !== wasConnected || currentWorkspaceId !== wasWorkspaceId)) {
    void refreshConnectedState();
  }
}

async function refreshConnectedState(): Promise<void> {
  // 连接状态或工作区发生变化时，页面 DOM 不一定会同步变化，因此不能只依赖 MutationObserver。
  // 这里先刷新当前工作区的放行规则和提示词资源，再主动触发自动初始化检查和主循环扫描。
  // runMainLoop 仍会执行一次，但新工具调用必须属于状态机中的活跃轮次，避免连接恢复时执行历史消息。
  await loadWorkspaceData(currentWorkspaceId);
  await loadPromptsFromStorage();
  autoInitPrompt.scheduleCheck();
  observePageTurnState();
  runMainLoop();
}

async function handleManualInitRequest(sendResponse: RuntimeSendResponse): Promise<void> {
  try {
    sendResponse(await autoInitPrompt.appendManualInitPrompt());
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const autoInitPrompt = new AutoInitPromptController({
  getSelectors: () => DOM,
  getSiteId: () => currentSiteId,
  isClientConnected: () => isClientConnected,
  loadPromptsFromStorage,
});

function initDOMConfig(): void {
  void loadDOMConfig();
}

async function loadDOMConfig(): Promise<void> {
  const syncItems = await getStorage(chrome.storage.sync, ["autoSend"]);
  CONFIG.autoSend = typeof syncItems.autoSend === "boolean" ? syncItems.autoSend : true;

  const status = await getCurrentStatus();
  if (!status?.connected || typeof status.siteId !== "string") {
    resetCurrentSite();
    console.log(`${BRANDING.productName}: Current tab is not connected to a configured site. Idle.`);
    return;
  }

  isClientConnected = true;
  currentSiteId = status.siteId;
  if (typeof status.workspaceId === "string") {
    currentWorkspaceId = status.workspaceId;
  }

  const localItems = await getStorage(chrome.storage.local, ["syncedAiSites"]);
  const sites = getSyncedAiSites(localItems.syncedAiSites);
  applySyncedSiteConfig(status.siteId, sites);
}

function applySyncedSiteConfig(siteId: string, sites: SyncedAiSite[]): void {
  const matchedSite = sites.find((site) => site.id === siteId);

  if (matchedSite && isSiteSelectors(matchedSite.selectors)) {
    DOM = matchedSite.selectors;
    currentSiteName = matchedSite.name ?? matchedSite.id;
    completionNotifier.reset();
    pageTurnState.reset();
    autoInitPrompt.setupTrigger();
    sendIntentObserver.start();
    void loadPromptsFromStorage();
    autoInitPrompt.scheduleCheck();
    startObserver();
    return;
  }

  DOM = null;
  currentSiteName = null;
  console.log(`${BRANDING.productName}: Site '${siteId}' is not configured in VS Code. Idle.`);
}

function resetCurrentSite(): void {
  DOM = null;
  currentSiteName = null;
  currentSiteId = null;
  pageTurnState.reset();
  completionNotifier.reset();
}

function getCurrentStatus(): Promise<StatusResponse | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response: unknown) => {
      resolve(isStatusResponse(response) ? response : null);
    });
  });
}

function getStorage(area: chrome.storage.StorageArea, keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    area.get(keys, (items: Record<string, unknown>) => resolve(items));
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync") {
    if (changes.autoSend) {
      const nextAutoSend = changes.autoSend.newValue as unknown;
      CONFIG.autoSend = typeof nextAutoSend === "boolean" ? nextAutoSend : true;
    }
  }
  if (namespace === "local") {
    const approvalStorageKey = `allowed_tools_${currentWorkspaceId}`;
    if (changes[approvalStorageKey]) {
      approvalState = parseStoredApprovalEntries(changes[approvalStorageKey].newValue as unknown);
      Logger.log(`Allowed tools updated (Workspace: ${currentWorkspaceId})`, "action");
    }
    if (changes.syncedAiSites) {
      initDOMConfig();
      Logger.log(t("config_updated"), "action");
    }
    if (hasPromptResourceChange(changes, currentSiteId)) {
      void loadPromptsFromStorage().then(() => {
        autoInitPrompt.scheduleCheck();
      });
    }
  }
});

// === 主循环逻辑 ===

// 统一管理工具调用内部 requestKey 的生命周期：已发现、执行中、结果缓存、已回填，以及当前轮次去重。
const requestRegistry = new ToolRequestRegistry();

// === 性能优化: MutationObserver 取代 setInterval ===
// 主循环调度锁。DOM 变化、工具完成、协议错误稳定性检查都可能频繁触发 runMainLoop；
// 这个标记确保同一时间只挂起一个延迟检查，避免页面流式输出时排出大量重复 setTimeout。
let isCheckScheduled = false;

const completionNotifier = new CompletionNotifier();
const pageTurnState = new PageTurnStateMachine();
const sendIntentObserver = new SendIntentObserver({
  getSelectors: () => DOM,
  isClientConnected: () => isClientConnected,
  onSubmit: () => markPageTurnSubmitted("user"),
});
const toolTurnCoordinator = new ToolTurnCoordinator({
  getApprovalState: () => approvalState,
  getSelectors: () => DOM,
  getSiteId: () => currentSiteId,
  getWorkspaceId: () => currentWorkspaceId,
  onResultBatch: handleResultDelivery,
  pageTurnState,
  requestRegistry,
  scheduleMainLoop,
});
let isResultDeliveryRunning = false;
let isResultDeliveryRerunNeeded = false;

/**
 * 延迟调度一次主循环扫描。
 *
 * 这个函数是所有异步入口重新进入 runMainLoop 的统一入口，包括 DOM 变化、工具执行完成、
 * 协议错误等待稳定、以及 AI 还在输出时的延迟重试。isCheckScheduled 会把同一时间窗口内的
 * 多次触发合并成一次 setTimeout，避免流式输出时每个字符变化都排队一次完整扫描。
 *
 * delayMs 表示调用方认为页面或工具状态还需要多久才可能稳定。进入 runMainLoop 后会释放
 * 调度锁；如果本轮扫描发现还需要继续等待，会再次通过 scheduleMainLoop 安排下一轮。
 */
function scheduleMainLoop(delayMs: number): void {
  if (isCheckScheduled) {return;}
  isCheckScheduled = true;
  setTimeout(runMainLoop, delayMs);
}

function observePageTurnState(): void {
  if (!DOM || !isClientConnected) {return;}

  const observation = pageTurnState.observe(DOM);
  completionNotifier.notify(pageTurnState.consumeCompletionEvent());
  if (observation.nextCheckDelayMs !== null) {
    scheduleMainLoop(observation.nextCheckDelayMs);
  }
}

function markPageTurnSubmitted(source: "user" | "auto-send"): void {
  if (!DOM) {return;}

  pageTurnState.markSubmitted(DOM, source);
  scheduleMainLoop(50);
}

/**
 * 扫描当前页面最新一轮 AI 回复中的工具调用，并在本轮工具都结束后把结果回填给输入框。
 *
 * 这个循环可能由页面 DOM 变化、工具执行完成、协议错误稳定性检查等多个入口触发。它只处理
 * 最新的一条 AI 消息，避免历史消息反复触发工具；每个工具调用再用内部 requestKey 做去重、执行
 * 状态跟踪和结果回填标记。
 *
 * 整体流程：
 * 1. 找到最新 AI 消息里的候选代码块。
 * 2. 解析工具调用协议，给调用生成稳定的模型 request_id 和内部 requestKey。
 * 3. 新调用进入执行路径，已知调用只刷新视觉状态。
 * 4. 当前轮次所有工具都有结果后，按页面顺序合并结果并写回输入框。
 * 5. 如果 AI 还在输出、工具还没完成、或 JSON 还没稳定，则安排下一次检查。
 */
function runMainLoop() {
  // 进入实际扫描后释放调度锁；本轮扫描期间如果还需要等待，会重新调用 scheduleMainLoop。
  isCheckScheduled = false;
  if (!DOM || !isClientConnected) { return; }
  observePageTurnState();
  toolTurnCoordinator.scan();
}

function handleResultDelivery(resultBatch: BufferedResultBatch, selectors: SiteSelectors): void {
  if (isResultDeliveryRunning) {
    isResultDeliveryRerunNeeded = true;
    return;
  }

  isResultDeliveryRunning = true;
  let batchFinalized = false;
  void UI.deliverResult(resultBatch.output, selectors)
    .then((delivery) => {
      if (!delivery.delivered) {
        toolTurnCoordinator.finalizeBatch(resultBatch.ids);
        batchFinalized = true;
        Logger.log(
          "Result delivery could not be verified. Marked batch flushed to avoid duplicate delivery; auto-send skipped.",
          "error"
        );
        return;
      }

      toolTurnCoordinator.finalizeBatch(resultBatch.ids);
      batchFinalized = true;
      if (CONFIG.autoSend) {
        markPageTurnSubmitted("auto-send");
      }
      UI.triggerAutoSend(CONFIG, selectors);
    })
    .catch((error) => {
      toolTurnCoordinator.finalizeBatch(resultBatch.ids);
      batchFinalized = true;
      Logger.log(`Result delivery failed: ${getErrorMessage(error)}`, "error");
    })
    .finally(() => {
      isResultDeliveryRunning = false;
      const shouldRerun = isResultDeliveryRerunNeeded && batchFinalized;
      isResultDeliveryRerunNeeded = false;
      if (shouldRerun) {
        scheduleMainLoop(50);
      }
    });
}

/**
 * 监听页面内容变化，并把高频 DOM 更新合并成一次延迟主循环扫描。
 *
 * AI 输出通常是流式写入页面的，MutationObserver 可能在很短时间内被触发很多次。这里不直接
 * 调用 runMainLoop，而是通过 scheduleMainLoop 按 CONFIG.pollInterval 节流，让工具解析在
 * 文本相对稳定后再发生，也避免重复解析同一批代码块。
 *
 * 很多站点通过 class/style/aria-* 切换发送和停止按钮的可见性，不一定增删 DOM 节点。因此也
 * 监听常见状态属性变化，让页面状态机有机会重新执行可见性和轮次判断。
 */
const observer = new MutationObserver(() => {
  if (!isClientConnected) { return; }

  // DOM 变化只说明页面可能出现了新内容；延迟扫描能等待流式文本继续补全。
  scheduleMainLoop(CONFIG.pollInterval);
});

/**
 * 启动页面观察，并在首次确认 VS Code 网关已连接后主动运行一次主循环。
 *
 * 观察者只负责之后的 DOM 变化；如果 content script 注入时页面上已经有工具调用，或者连接
 * 状态是在注入后才返回的，页面可能不会再产生新的 DOM 事件。因此 GET_STATUS 成功后需要
 * 立即刷新工作区数据、加载提示资源，并直接调用 runMainLoop 做一次首轮扫描。
 */
function startObserver() {
  if (!currentSiteName || !DOM) {return;}
  // Initialize observer only once
  const observerWindow = window as unknown as Record<string, boolean | undefined>;
  if (observerWindow[PROTOCOL.observerStartedFlag]) {return;}
  observerWindow[PROTOCOL.observerStartedFlag] = true;

  // 1. Start observing immediately (but logic inside is guarded by isClientConnected)
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: OBSERVED_STATE_ATTRIBUTES,
    childList: true,
    subtree: true,
    characterData: true
  });

  // 2. Check initial status
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, async (response: unknown) => {
    if (isStatusResponse(response) && response.connected) {
      isClientConnected = true;
      if (typeof response.workspaceId === "string") {
        currentWorkspaceId = response.workspaceId;
        await loadWorkspaceData(currentWorkspaceId);
      }
      await loadPromptsFromStorage();
      Logger.log(`${BRANDING.productName} activated for ${currentSiteName} (Connected)`, "info");
      // 连接恢复后先检查自动初始化触发词，再立刻扫描现有消息，避免等待下一次页面变化。
      autoInitPrompt.scheduleCheck();
      observePageTurnState();
      runMainLoop();
    } else {
      isClientConnected = false;
      console.log(`${BRANDING.productName} loaded for ${currentSiteName} (Disconnected - Idle)`);
      // Optional: Inform user that connection is missing
    }
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

initDOMConfig();
