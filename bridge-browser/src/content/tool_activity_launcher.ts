import { BRANDING } from "@webcode/shared";
import { t } from "../modules/i18n";

export interface ToolActivityLauncherView {
  launcher: HTMLButtonElement;
  launcherCount: HTMLSpanElement;
  launcherLabel: HTMLSpanElement;
  launcherMark: HTMLSpanElement;
}

export function createLauncherView(): ToolActivityLauncherView {
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "launcher";
  launcher.title = t("work_panel_open");
  launcher.setAttribute("aria-label", launcher.title);
  launcher.setAttribute("aria-expanded", "false");
  const content = document.createElement("span");
  content.className = "launcher-content";
  const launcherMark = document.createElement("span");
  launcherMark.className = "launcher-mark idle";
  launcherMark.textContent = "▤";
  const launcherCopy = document.createElement("span");
  launcherCopy.className = "launcher-copy";
  const launcherTitle = document.createElement("span");
  launcherTitle.className = "launcher-title";
  launcherTitle.textContent = `${BRANDING.productName} · ${t("work_panel_title")}`;
  const launcherLabel = document.createElement("span");
  launcherLabel.className = "launcher-label";
  launcherLabel.textContent = launcherTitle.textContent;
  const launcherCount = document.createElement("span");
  launcherCount.className = "launcher-count";
  launcherCount.style.display = "none";
  launcherCopy.append(launcherTitle, launcherLabel);
  content.append(launcherMark, launcherCopy, launcherCount);
  launcher.appendChild(content);
  return { launcher, launcherCount, launcherLabel, launcherMark };
}

/** Measure the content independently of the animated button width to avoid resize feedback. */
export function observeLauncherWidth(launcher: HTMLButtonElement, onResize: () => void): void {
  const content = launcher.querySelector<HTMLElement>(".launcher-content");
  if (!content || typeof ResizeObserver === "undefined") {return;}
  const observer = new ResizeObserver(() => {
    const contentWidth = content.getBoundingClientRect().width;
    if (contentWidth === 0) {return;}
    const width = `${Math.ceil(contentWidth) + 2}px`;
    if (launcher.style.width === width) {return;}
    launcher.style.width = width;
    onResize();
  });
  observer.observe(content);
  launcher.addEventListener("transitionend", onResize);
}
