import { BRANDING } from '@webcode/shared';

interface I18nState {
  lang: string;
  resources: {
    prompt: string | null;
    train: string | null;
    error: string | null;
    init: string | null;
    oversize: string | null;
  };
}

// === 国际化资源 ===
export const i18n: I18nState = {
  lang: navigator.language.startsWith("zh") ? "zh" : "en",
  resources: { prompt: null, train: null, error: null, init: null, oversize: null },
};

// === 日志字典 ===
const LOG_MSGS: Record<string, { en: string; zh: string }> = {
  auto_filled: {
    en: "Auto-filled initial Prompt",
    zh: "已自动填充初始 Prompt",
  },
  captured: { en: "Captured Call", zh: "捕获调用" },
  args: { en: "Args", zh: "参数" },
  exec_success: { en: "Execution Success", zh: "执行成功" },
  exec_fail: { en: "Execution Failed", zh: "执行失败" },
  training_hint: {
    en: "Added periodic training note",
    zh: "已附加定期复训提示",
  },
  input_not_found: { en: "Input box not found!", zh: "找不到输入框!" },
  result_written: {
    en: "Result written back to input",
    zh: "结果已回填至输入框",
  },
  send_success_cleared: {
    en: "Send success (Input cleared)",
    zh: "发送成功 (输入框已清空)",
  },
  send_btn_missing: {
    en: "Send button not found...",
    zh: "未找到发送按钮...",
  },
  send_btn_disabled: {
    en: "Send button disabled (UI not updated)...",
    zh: "发送按钮仍被禁用 (UI未更新)...",
  },
  auto_send_attempt: { en: "Attempting auto-send", zh: "尝试自动发送" },
  auto_send_timeout: {
    en: "Auto-send timed out, please click manually",
    zh: "自动发送超时，请手动点击发送",
  },
  config_updated: { en: "Selectors config updated", zh: "选择器配置已更新" },
  waiting_tools: { en: "Waiting for tools...", zh: "等待工具执行..." },
  hitl_intercept: { en: "Intercepted for approval", zh: "拦截等待审批" },
  hitl_rejected: { en: "User rejected execution", zh: "用户拒绝执行" },
  visual_processing: { en: "Running", zh: "执行中" },
  visual_success: { en: "Completed", zh: "执行完成" },
  visual_error: { en: "Error", zh: "错误" },

  // HITL Modal UI
  hitl_title: { en: "Approval Required", zh: "请求执行工具" },
  label_tool: { en: "Tool Name", zh: "工具名称" },
  label_purpose: { en: "Purpose", zh: "操作意图" },
  label_args: { en: "Arguments", zh: "调用参数" },
  label_rule_key: { en: "Rule Key", zh: "匹配规则" },
  placeholder_reason: { en: "Reason for rejection (Optional)...", zh: "拒绝理由 (可选)..." },
  
  btn_always: { en: "⚡ Always Allow", zh: "⚡ 永久允许" },
  btn_back: { en: "Back", zh: "返回" },
  btn_reject: { en: "Reject", zh: "拒绝" },
  btn_reject_confirm: { en: "Confirm Rejection", zh: "确认拒绝" },
  btn_approve: { en: "Approve", zh: "允许" },
  btn_allow_confirm: { en: "Confirm Allow", zh: "确认永久允许" },
  btn_allow_exact: { en: "Allow Exact Command", zh: "允许精确命令" },
  btn_allow_executable: { en: "Allow Executable", zh: "允许可执行文件" },
  btn_allow_prefix: { en: "Allow Prefix", zh: "允许命令前缀" },

  always_title: { en: "Remove Protection?", zh: "移除保护？" },
  always_desc_1: { en: "You are about to permanently allow", zh: "您即将把以下工具移出保护名单：" },
  always_desc_2: { en: "Future calls will execute automatically without approval.", zh: "今后 AI 调用此工具将不再经过人工审批。" },
  cmd_always_title: { en: "Allow This Command Permanently?", zh: "永久允许这条命令？" },
  cmd_always_desc: { en: "Choose the permanent approval scope for this command in the current workspace.", zh: "为当前工作区的这条命令选择永久授权范围。" },
  cmd_scope_exact_title: { en: "Exact Command", zh: "精确命令" },
  cmd_scope_exact_desc: { en: "Only this normalized command will be auto-approved.", zh: "只有这条归一化后的命令会被自动放行。" },
  cmd_scope_executable_title: { en: "Executable", zh: "可执行文件" },
  cmd_scope_executable_desc: { en: "Any command for this tool whose executable matches this value will be auto-approved.", zh: "此工具下，只要可执行文件匹配该值的命令都会被自动放行。" },
  cmd_scope_prefix_title: { en: "Command Prefix", zh: "命令前缀" },
  cmd_scope_prefix_desc: { en: "Any command starting with this normalized prefix will be auto-approved.", zh: "只要以这个归一化前缀开头的命令都会被自动放行。" }
};

export function t(key: string): string {
  const entry = LOG_MSGS[key];
  if (!entry) {return key;}
  return (entry as any)[i18n.lang] ?? entry.en;
}

const STANDARD_LOG_TYPES = ["info", "success", "warn", "error", "action"] as const;
type LoggerLogType = "summary" | typeof STANDARD_LOG_TYPES[number];
type LoggerFilterType = LoggerLogType | "all";
const LOGGER_DEFAULT_WIDTH = 480;
const LOGGER_DEFAULT_HEIGHT = 236;
const LOGGER_MIN_WIDTH = 480;
const LOGGER_MIN_HEIGHT = 180;

const LOG_TYPE_META: Record<LoggerLogType, { icon: string; color: string; label: { en: string; zh: string } }> = {
  summary: { icon: "📌", color: "#f5d76e", label: { en: "Summary", zh: "摘要" } },
  info: { icon: "🔹", color: "#ddd", label: { en: "Info", zh: "信息" } },
  success: { icon: "✅", color: "#4caf50", label: { en: "Success", zh: "成功" } },
  warn: { icon: "⚠️", color: "#ff9800", label: { en: "Warn", zh: "警告" } },
  error: { icon: "❌", color: "#f44336", label: { en: "Error", zh: "错误" } },
  action: { icon: "⚡", color: "#00bcd4", label: { en: "Action", zh: "操作" } },
};

function getFilterLabel(type: LoggerFilterType): string {
  if (type === "all") {
    return i18n.lang === "zh" ? "全部" : "All";
  }

  const meta = LOG_TYPE_META[type];
  return `${meta.icon} ${meta.label[i18n.lang === "zh" ? "zh" : "en"]}`;
}

// === Logger 组件 ===
export const Logger = {
  el: null as HTMLDivElement | null,
  panelEl: null as HTMLDivElement | null,
  contentEl: null as HTMLDivElement | null,
  filterButtons: new Map<LoggerFilterType, HTMLButtonElement>(),
  activeTypes: new Set<LoggerLogType>(["summary"]),
  isMinimized: false,

  init() {
    if (this.el) {return;}

    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "2147483647",
      display: "none",
    });

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent =       `:host{all:initial;color-scheme:dark;}*{box-sizing:border-box;}button{font:inherit;}.logger{position:relative;width:${LOGGER_DEFAULT_WIDTH}px;height:${LOGGER_DEFAULT_HEIGHT}px;min-width:${LOGGER_MIN_WIDTH}px;min-height:${LOGGER_MIN_HEIGHT}px;background:rgba(0,0,0,0.85);color:#00ff00;font-family:Consolas,"SFMono-Regular",Menlo,monospace;font-size:12px;border-radius:8px;display:flex;flex-direction:column;border:1px solid #333;backdrop-filter:blur(4px);box-shadow:0 4px 12px rgba(0,0,0,0.5);overflow:hidden;}.logger.minimized{width:auto!important;height:32px!important;min-width:78px!important;min-height:32px!important;}.header{min-height:32px;padding:5px 6px;background:#333;color:#fff;cursor:move;display:flex;justify-content:space-between;align-items:center;gap:8px;user-select:none;}.title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.drag-handle{display:none;align-self:stretch;width:18px;cursor:move;}.actions{display:flex;align-items:center;gap:4px;flex:0 0 auto;}.icon-btn{width:22px;height:22px;border:0;border-radius:4px;background:transparent;color:#ddd;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:1;padding:0;}.icon-btn:hover{background:rgba(255,255,255,0.14);color:#fff;}.icon-btn.close:hover{background:#9b1c1c;color:#fff;}.filters{display:flex;gap:4px;flex-wrap:nowrap;padding:6px;background:#151515;border-bottom:1px solid #333;}.filter{border:1px solid #3b3b3b;border-radius:4px;background:#222;color:#aaa;cursor:pointer;padding:2px 6px;line-height:16px;white-space:nowrap;}.filter:hover{border-color:#666;color:#fff;}.filter.active{background:#0b3d32;border-color:#14b88a;color:#d8fff3;}.filter-separator{color:#777;line-height:22px;padding:0 2px;user-select:none;}.content{flex:1;overflow-y:auto;padding:8px;}.line{margin-bottom:4px;line-height:1.4;word-break:break-word;}.time{color:#888;font-size:10px;}.resize-handle{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 0 44%,rgba(255,255,255,0.28) 45% 54%,transparent 55% 64%,rgba(255,255,255,0.38) 65% 74%,transparent 75%);}.logger.minimized .title,.logger.minimized .clear,.logger.minimized .minimize,.logger.minimized .filters,.logger.minimized .content,.logger.minimized .resize-handle{display:none;}.logger:not(.minimized) .restore{display:none;}.logger.minimized .drag-handle{display:block;}.logger.minimized .header{padding:4px;justify-content:flex-end;gap:4px;background:#222;}`;

    const panel = document.createElement("div");
    panel.className = "logger";
    this.panelEl = panel;

    const header = document.createElement("div");
    header.className = "header";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = `${BRANDING.bridgeName} Process Log`;

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.title = i18n.lang === "zh" ? "拖动日志窗口" : "Drag log window";
    dragHandle.setAttribute("aria-hidden", "true");

    const actions = document.createElement("div");
    actions.className = "actions";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "icon-btn clear";
    clearBtn.title = i18n.lang === "zh" ? "清空日志" : "Clear logs";
    clearBtn.setAttribute("aria-label", clearBtn.title);
    clearBtn.textContent = "🗑️";
    clearBtn.onclick = () => {
      if (this.contentEl) {this.contentEl.innerHTML = "";}
    };

    const minimizeBtn = document.createElement("button");
    minimizeBtn.type = "button";
    minimizeBtn.className = "icon-btn minimize";
    minimizeBtn.title = i18n.lang === "zh" ? "缩小" : "Minimize";
    minimizeBtn.setAttribute("aria-label", minimizeBtn.title);
    minimizeBtn.textContent = "−";
    minimizeBtn.onclick = () => this.setMinimized(true);

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "icon-btn restore";
    restoreBtn.title = i18n.lang === "zh" ? "放大" : "Restore";
    restoreBtn.setAttribute("aria-label", restoreBtn.title);
    restoreBtn.textContent = "□";
    restoreBtn.onclick = () => this.setMinimized(false);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-btn close";
    closeBtn.title = i18n.lang === "zh" ? "关闭日志" : "Close logs";
    closeBtn.setAttribute("aria-label", closeBtn.title);
    closeBtn.textContent = "×";
    closeBtn.onclick = () => this.close();

    actions.appendChild(clearBtn);
    actions.appendChild(minimizeBtn);
    actions.appendChild(restoreBtn);
    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(dragHandle);
    header.appendChild(actions);

    const filters = document.createElement("div");
    filters.className = "filters";
    this.filterButtons.clear();
    filters.appendChild(this.createFilterButton("summary"));
    filters.appendChild(this.createFilterSeparator());
    filters.appendChild(this.createFilterButton("all"));
    STANDARD_LOG_TYPES.forEach((type) => filters.appendChild(this.createFilterButton(type)));

    this.contentEl = document.createElement("div");
    this.contentEl.className = "content";

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle";
    resizeHandle.title = i18n.lang === "zh" ? "拖动调整大小" : "Resize log window";

    panel.appendChild(header);
    panel.appendChild(filters);
    panel.appendChild(this.contentEl);
    panel.appendChild(resizeHandle);
    shadow.appendChild(style);
    shadow.appendChild(panel);
    document.body.appendChild(host);

    this.el = host;
    this.refreshFilterButtons();
    this.makeDraggable(header);
    this.makeResizable(resizeHandle);
  },

  createFilterButton(filter: LoggerFilterType): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter";
    button.textContent = getFilterLabel(filter);
    button.onclick = () => this.setFilter(filter);
    this.filterButtons.set(filter, button);
    return button;
  },

  createFilterSeparator(): HTMLSpanElement {
    const separator = document.createElement("span");
    separator.className = "filter-separator";
    separator.textContent = "|";
    return separator;
  },

  setFilter(filter: LoggerFilterType) {
    if (filter === "all") {
      const allStandardTypesActive = STANDARD_LOG_TYPES.every((type) => this.activeTypes.has(type));
      STANDARD_LOG_TYPES.forEach((type) => {
        if (allStandardTypesActive) {
          this.activeTypes.delete(type);
        } else {
          this.activeTypes.add(type);
        }
      });
    } else if (this.activeTypes.has(filter)) {
      this.activeTypes.delete(filter);
    } else {
      this.activeTypes.add(filter);
    }

    this.refreshFilterButtons();
    this.applyFilters();
  },

  refreshFilterButtons() {
    this.filterButtons.forEach((button, filter) => {
      const isActive = filter === "all"
        ? STANDARD_LOG_TYPES.every((type) => this.activeTypes.has(type))
        : this.activeTypes.has(filter);
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  },

  applyFilters() {
    if (!this.contentEl) {return;}

    this.contentEl.querySelectorAll<HTMLDivElement>(".line").forEach((line) => {
      const type = line.dataset.logType as LoggerLogType | undefined;
      line.hidden = type ? !this.activeTypes.has(type) : false;
    });
  },

  setMinimized(minimized: boolean) {
    this.isMinimized = minimized;
    if (this.panelEl) {
      this.panelEl.classList.toggle("minimized", minimized);
    }
  },

  makeDraggable(headerEl: HTMLElement) {
    let isDragging = false,
      startX: number,
      startY: number,
      iLeft: number,
      iTop: number;
    headerEl.onmousedown = (e) => {
      if (!this.el) {return;}
      if ((e.target as HTMLElement).closest("button")) {return;}
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const r = this.el.getBoundingClientRect();
      iLeft = r.left;
      iTop = r.top;
    };
    window.onmousemove = (e) => {
      if (isDragging && this.el) {
        const rect = this.el.getBoundingClientRect();
        let left = iLeft + e.clientX - startX;
        let top = iTop + e.clientY - startY;
        // Keep the full window within the viewport horizontally, and at least the header (32px) vertically
        left = Math.max(0, Math.min(left, window.innerWidth - rect.width));
        top = Math.max(0, Math.min(top, window.innerHeight - 32));
        this.el.style.left = left + "px";
        this.el.style.top = top + "px";
        this.el.style.right = "auto";
      }
    };
    window.onmouseup = () => (isDragging = false);
  },

  makeResizable(handleEl: HTMLElement) {
    let isResizing = false,
      startX: number,
      startY: number,
      startWidth: number,
      startHeight: number;

    handleEl.onmousedown = (e) => {
      if (!this.el || !this.panelEl || this.isMinimized) {return;}
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      const hostRect = this.el.getBoundingClientRect();
      const panelRect = this.panelEl.getBoundingClientRect();
      startWidth = panelRect.width;
      startHeight = panelRect.height;
      this.el.style.left = hostRect.left + "px";
      this.el.style.top = hostRect.top + "px";
      this.el.style.right = "auto";
    };

    window.addEventListener("mousemove", (e) => {
      if (!isResizing || !this.panelEl) {return;}
      const width = Math.max(LOGGER_MIN_WIDTH, startWidth + e.clientX - startX);
      const height = Math.max(LOGGER_MIN_HEIGHT, startHeight + e.clientY - startY);
      this.panelEl.style.width = width + "px";
      this.panelEl.style.height = height + "px";
    });

    window.addEventListener("mouseup", () => {
      isResizing = false;
    });
  },

  toggle(show: boolean) {
    if (!this.el && show) {this.init();}
    if (this.el) {this.el.style.display = show ? "block" : "none";}
  },

  close() {
    this.toggle(false);
    this.syncVisibility(false);
  },

  syncVisibility(show: boolean) {
    try {
      chrome.runtime.sendMessage({ type: "SET_LOG_VISIBLE", show }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // Logger may be reused outside an extension context during local testing.
    }
  },

  log(msg: string, type: LoggerLogType = "info") {
    if (!this.el || this.el.style.display === "none") {return;}
    const line = document.createElement("div");
    line.className = "line";
    line.dataset.logType = type;
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    const meta = LOG_TYPE_META[type];
    const timeEl = document.createElement("span");
    timeEl.className = "time";
    timeEl.textContent = `[${time}]`;

    const msgEl = document.createElement("span");
    msgEl.style.color = meta.color;
    msgEl.textContent = msg;

    line.appendChild(timeEl);
    line.append(` ${meta.icon} `);
    line.appendChild(msgEl);
    line.hidden = !this.activeTypes.has(type);

    if (this.contentEl) {
      this.contentEl.appendChild(line);
      if (!line.hidden) {
        this.contentEl.scrollTop = this.contentEl.scrollHeight;
      }
    }
  },
};
