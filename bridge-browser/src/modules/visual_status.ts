import { BRANDING } from "@webcode/shared";
import { t } from "./i18n";

type VisualState = "processing" | "success" | "error";

const VISUAL_STATUS_STYLE_ID = `${BRANDING.slug}-mcp-visual-status-style`;

function ensureVisualStatusStyle() {
  if (document.getElementById(VISUAL_STATUS_STYLE_ID)) {return;}

  const style = document.createElement("style");
  style.id = VISUAL_STATUS_STYLE_ID;
  style.textContent = `
    [data-mcp-visual="true"] {
      position: relative !important;
      box-sizing: border-box !important;
    }
    [data-mcp-visual="true"]::after {
      content: attr(data-mcp-status-label);
      position: absolute;
      top: 6px;
      right: 8px;
      z-index: 10;
      padding: 2px 8px;
      border-radius: 999px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      font-weight: 700;
      line-height: 16px;
      letter-spacing: 0.02em;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
      white-space: nowrap;
    }
    [data-mcp-visual="true"][data-mcp-state="processing"]::before {
      content: "...";
      position: absolute;
      top: 8px;
      right: 12px;
      z-index: 11;
      width: 0;
      overflow: hidden;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      font-weight: 700;
      line-height: 16px;
      pointer-events: none;
      white-space: nowrap;
      animation: ${BRANDING.slug}-mcp-loading-dots 1.2s steps(4, end) infinite;
    }
    [data-mcp-visual="true"][data-mcp-state="processing"]::after {
      background: #1565C0;
      padding-right: 24px;
      animation: ${BRANDING.slug}-mcp-status-pulse 1.2s ease-in-out infinite;
    }
    [data-mcp-visual="true"][data-mcp-state="success"]::after {
      background: #008C45;
    }
    [data-mcp-visual="true"][data-mcp-state="error"]::after {
      background: #C62828;
    }
    @keyframes ${BRANDING.slug}-mcp-loading-dots {
      0% {
        width: 0;
      }
      25% {
        width: 0.35em;
      }
      50% {
        width: 0.7em;
      }
      75%,
      100% {
        width: 1.05em;
      }
    }
    @keyframes ${BRANDING.slug}-mcp-status-pulse {
      0%,
      100% {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
      }
      50% {
        box-shadow: 0 2px 12px rgba(21, 101, 192, 0.55);
      }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function markVisualState(
  element: HTMLElement,
  state: VisualState,
  labelKey: string,
  borderColor: string,
  shadowColor: string
) {
  const label = t(labelKey);
  const visualElement = getVisualElement(element);
  if (
    element.dataset.mcpState === state &&
    visualElement.dataset.mcpState === state &&
    visualElement.dataset.mcpStatusLabel === label
  ) {
    return;
  }

  ensureVisualStatusStyle();
  if (visualElement !== element && element.dataset.mcpVisual === "true") {
    clearVisualAttributes(element);
  }

  element.dataset.mcpState = state;
  element.dataset.mcpStatusLabel = label;

  if (visualElement !== element) {
    delete element.dataset.mcpVisual;
  }

  visualElement.style.border = `2px solid ${borderColor}`;
  visualElement.style.borderRadius = "6px";
  visualElement.style.transition = "border-color 0.3s ease, box-shadow 0.3s ease";
  visualElement.style.boxShadow = `0 0 0 3px ${shadowColor}`;
  visualElement.dataset.mcpState = state;
  visualElement.dataset.mcpVisual = "true";
  visualElement.dataset.mcpStatusLabel = label;
}

function getVisualElement(element: HTMLElement): HTMLElement {
  if (element.tagName.toLowerCase() === "code") {
    const pre = element.closest("pre");
    if (pre instanceof HTMLElement && shouldUsePreVisualElement(element, pre)) {
      return pre;
    }
  }

  return element;
}

function shouldUsePreVisualElement(element: HTMLElement, pre: HTMLElement): boolean {
  const display = window.getComputedStyle(element).display;
  if (display.includes("inline") || display === "contents") {
    return true;
  }

  const elementRect = element.getBoundingClientRect();
  const preRect = pre.getBoundingClientRect();
  if (elementRect.width <= 0 || preRect.width <= 0) {
    return false;
  }

  return elementRect.width + 24 < preRect.width;
}

function clearVisualAttributes(element: HTMLElement) {
  const hadVisualStyle = element.dataset.mcpVisual === "true";

  delete element.dataset.mcpState;
  delete element.dataset.mcpVisual;
  delete element.dataset.mcpStatusLabel;

  if (!hadVisualStyle) {return;}

  element.style.border = "";
  element.style.borderRadius = "";
  element.style.transition = "";
  element.style.boxShadow = "";
}

export function clearVisualState(element: HTMLElement) {
  const visualElement = getVisualElement(element);

  clearVisualAttributes(element);
  if (visualElement !== element) {
    clearVisualAttributes(visualElement);
  }
}

// 状态 1: 处理中 (蓝色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“处理中”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为蓝色，表示该 MCP 工具请求已被捕获并正在排队或执行中。
 */
export function markVisualProcessing(element: HTMLElement) {
  markVisualState(element, "processing", "visual_processing", "#2196F3", "rgba(33, 150, 243, 0.24)");
}

// 状态 2: 成功 (绿色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“执行成功”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为绿色，表示 MCP 工具已经执行完毕且结果已写回给大模型。
 */
export function markVisualSuccess(element: HTMLElement) {
  markVisualState(element, "success", "visual_success", "#00E676", "rgba(0, 230, 118, 0.22)");
}

// 状态 3: 错误 (红色)
/**
 * 视觉标记：将页面上的工具调用代码块标记为“执行失败/错误”状态
 * @param element 要标记的 HTML 元素
 * @description 修改元素的边框为红色，表示该工具调用在执行或 JSON 解析阶段发生错误，或被用户人工拒绝。
 */
export function markVisualError(element: HTMLElement) {
  markVisualState(element, "error", "visual_error", "#F44336", "rgba(244, 67, 54, 0.24)");
}
