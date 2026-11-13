import { FOLLOW_UP_COMPOSER_STYLE_TEXT } from "./follow_up_overlay_styles";
import { createLauncherView, type ToolActivityLauncherView } from "./tool_activity_launcher";
import { TOOL_ACTIVITY_STYLE_TEXT } from "./tool_activity_overlay_styles";

interface OverlayView extends ToolActivityLauncherView {
  activityMount: HTMLDivElement;
  statusMount: HTMLDivElement;
  statusLabel: HTMLDivElement;
  statusHint: HTMLDivElement;
  headerMount: HTMLDivElement;
  historyPanel: HTMLDivElement;
  host: HTMLDivElement;
  panel: HTMLDivElement;
}

export function createOverlayView(): OverlayView {
  const host = document.createElement("div");
  host.style.display = "none";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${TOOL_ACTIVITY_STYLE_TEXT}\n${FOLLOW_UP_COMPOSER_STYLE_TEXT}`;
  const launcherView = createLauncherView();
  const stack = document.createElement("div");
  stack.className = "overlay-stack";
  const historyPanel = document.createElement("div");
  historyPanel.className = "history-panel";
  historyPanel.style.display = "none";
  const panel = document.createElement("div");
  panel.className = "panel";
  const headerMount = document.createElement("div");
  headerMount.className = "header-mount";
  const activityMount = document.createElement("div");
  activityMount.className = "activity-mount";
  const statusMount = document.createElement("div");
  statusMount.className = "footer work-status";
  const statusLabel = document.createElement("div");
  statusLabel.className = "work-status-label";
  const statusHint = document.createElement("div");
  statusHint.className = "work-status-hint";
  statusMount.append(statusLabel, statusHint);
  panel.append(headerMount, activityMount, statusMount);
  stack.append(historyPanel, panel);
  shadow.append(style, launcherView.launcher, stack);
  document.body.appendChild(host);
  return { activityMount, statusMount, statusLabel, statusHint, headerMount, historyPanel, host, panel, ...launcherView };
}
