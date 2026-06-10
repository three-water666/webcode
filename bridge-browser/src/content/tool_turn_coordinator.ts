import { t } from "../modules/i18n";
import { Logger } from "../modules/logger";
import * as UI from "../modules/ui";
import { type SiteSelectors } from "../modules/config";
import { looksLikeToolCall, parseToolCall } from "../modules/toolCallProtocol";
import { type ApprovalState } from "./approval_policy";
import { type PageTurnStateMachine } from "./page_turn_state";
import { logToolSummary, ToolCallTracker } from "./tool_call_tracker";
import { ToolExecutor } from "./tool_executor";
import {
  type BufferedResultBatch,
  type ToolRequestRegistry,
  type ToolRequestTurn,
  type UnflushedRequestBatch,
} from "./tool_request_registry";

interface ToolTurnCoordinatorOptions {
  getApprovalState: () => ApprovalState;
  getSelectors: () => SiteSelectors | null;
  getSiteId: () => string | null;
  getWorkspaceId: () => string;
  onResultBatch: (resultBatch: BufferedResultBatch, selectors: SiteSelectors) => void;
  pageTurnState: PageTurnStateMachine;
  requestRegistry: ToolRequestRegistry;
  scheduleMainLoop: (delayMs: number) => void;
}

interface ToolCodeBlockContext {
  codeBlockIndex: number;
  codeEl: Element;
  currentTurn: ToolRequestTurn;
  messageElement: Element;
  messageIndex: number;
  textContent: string;
}

export class ToolTurnCoordinator {
  private readonly toolCallTracker: ToolCallTracker;
  private readonly toolExecutor: ToolExecutor;
  private lastProgressLogTime = 0;
  private lastProgressStatus = "";

  public constructor(private readonly options: ToolTurnCoordinatorOptions) {
    this.toolCallTracker = new ToolCallTracker({
      requestRegistry: options.requestRegistry,
      scheduleMainLoop: options.scheduleMainLoop,
    });
    this.toolExecutor = new ToolExecutor({
      getApprovalState: options.getApprovalState,
      getSelectors: options.getSelectors,
      getSiteId: options.getSiteId,
      getWorkspaceId: options.getWorkspaceId,
      requestRegistry: options.requestRegistry,
      scheduleMainLoop: options.scheduleMainLoop,
    });
  }

  public scan(): void {
    const selectors = this.options.getSelectors();
    if (!selectors) {return;}

    const latestCodeBlocks = UI.getLatestResponseCodeBlocks(selectors);
    if (!latestCodeBlocks) {return;}

    const currentTurn = this.options.requestRegistry.createTurn();
    latestCodeBlocks.codeElements.forEach((codeEl, codeBlockIndex) => {
      this.scanCodeBlock(
        latestCodeBlocks.messageElement,
        latestCodeBlocks.messageIndex,
        codeEl,
        codeBlockIndex,
        currentTurn
      );
    });

    this.handleUnflushedBatch(currentTurn.getUnflushedBatch(), selectors);
  }

  public finalizeBatch(requestKeys: readonly string[]): void {
    this.options.requestRegistry.markFlushed(requestKeys);
    this.options.pageTurnState.noteToolResultsDelivered();
  }

  private scanCodeBlock(
    messageElement: Element,
    messageIndex: number,
    codeEl: Element,
    codeBlockIndex: number,
    currentTurn: ToolRequestTurn
  ): void {
    const textContent = (codeEl.textContent ?? "").trim();
    if (!looksLikeToolCall(textContent)) {return;}

    const context: ToolCodeBlockContext = {
      codeBlockIndex,
      codeEl,
      currentTurn,
      messageElement,
      messageIndex,
      textContent,
    };

    try {
      this.handleValidToolCall(context);
    } catch (error) {
      this.handleProtocolError(context, error);
    }
  }

  private handleValidToolCall(context: ToolCodeBlockContext): void {
    const payload = parseToolCall(context.textContent);
    const codeHtmlElement = context.codeEl as HTMLElement;
    if (codeHtmlElement.dataset.mcpState === "error") {
      UI.clearVisualState(codeHtmlElement);
    }

    const requestIdentity = this.toolCallTracker.ensurePayloadRequestIdentity(
      payload,
      codeHtmlElement,
      context.messageIndex,
      context.codeBlockIndex
    );
    this.toolCallTracker.clearProtocolErrorFeedbackState(requestIdentity.requestKey);

    const isProcessing = this.options.requestRegistry.isRunning(requestIdentity.requestKey);
    const isKnown = this.options.requestRegistry.hasSeen(requestIdentity.requestKey);
    if (!isKnown && !this.options.pageTurnState.canStartToolCapture(context.messageElement)) {
      return;
    }

    context.currentTurn.add(requestIdentity.requestKey);
    if (!isKnown) {
      this.startToolExecution(codeHtmlElement, payload, requestIdentity);
      return;
    }

    if (isProcessing) {
      UI.markVisualProcessing(codeHtmlElement);
    } else {
      UI.markVisualSuccess(codeHtmlElement);
    }
  }

  private handleProtocolError(context: ToolCodeBlockContext, error: unknown): void {
    if (!this.options.pageTurnState.canStartToolCapture(context.messageElement)) {
      return;
    }

    this.options.pageTurnState.noteToolCaptureStarted();
    const requestIdentity = this.toolCallTracker.handleProtocolErrorBlock(
      context.codeEl as HTMLElement,
      context.textContent,
      context.messageIndex,
      context.codeBlockIndex,
      error
    );
    context.currentTurn.add(requestIdentity?.requestKey ?? null);
  }

  private startToolExecution(
    codeEl: HTMLElement,
    payload: ReturnType<typeof parseToolCall>,
    requestIdentity: { requestKey: string; requestId: string }
  ): void {
    this.options.pageTurnState.noteToolCaptureStarted();
    this.options.requestRegistry.markRunning(requestIdentity.requestKey);
    UI.cancelAutoSend();
    UI.markVisualProcessing(codeEl);
    Logger.log(`${t("captured")}: ${payload.name}`, "info");
    logToolSummary(payload);
    this.toolExecutor.execute(payload, requestIdentity);
  }

  private handleUnflushedBatch(
    unflushedBatch: UnflushedRequestBatch,
    selectors: SiteSelectors
  ): void {
    if (!unflushedBatch.hasRequests) {return;}

    if (unflushedBatch.isComplete) {
      this.handleCompleteBatch(unflushedBatch, selectors);
      return;
    }

    this.options.pageTurnState.noteToolResultsPending();
    this.logProgress(unflushedBatch.completedCount, unflushedBatch.totalCount);
  }

  private handleCompleteBatch(
    unflushedBatch: UnflushedRequestBatch,
    selectors: SiteSelectors
  ): void {
    if (UI.isStopButtonVisible(selectors)) {
      this.options.scheduleMainLoop(1000);
      return;
    }

    const resultBatch = this.options.requestRegistry.buildBufferedResultBatch(unflushedBatch.ids);
    if (resultBatch.hasOutput) {
      Logger.log(`Batch finished: ${resultBatch.outputCount} tools. Writing...`, "success");
      this.options.onResultBatch(resultBatch, selectors);
    } else if (resultBatch.hasAnyResult) {
      this.finalizeBatch(resultBatch.ids);
    }
    this.lastProgressStatus = "";
  }

  private logProgress(completedCount: number, totalCount: number): void {
    const statusStr = `${completedCount}/${totalCount}`;
    const now = Date.now();
    if (statusStr === this.lastProgressStatus && now - this.lastProgressLogTime <= 3000) {
      return;
    }

    Logger.log(`${t("waiting_tools")} (${statusStr})`, "warn");
    this.lastProgressStatus = statusStr;
    this.lastProgressLogTime = now;
  }
}
