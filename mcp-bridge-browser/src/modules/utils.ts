interface I18nState {
  lang: string;
  resources: {
    prompt: string | null;
    train: string | null;
    error: string | null;
  };
}

// === 国际化资源 ===
export const i18n: I18nState = {
  lang: navigator.language.startsWith("zh") ? "zh" : "en",
  resources: { prompt: null, train: null, error: null },
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

  // HITL Modal UI
  hitl_title: { en: "Approval Required", zh: "请求执行工具" },
  label_tool: { en: "Tool Name", zh: "工具名称" },
  label_purpose: { en: "Purpose", zh: "操作意图" },
  label_args: { en: "Arguments", zh: "调用参数" },
  placeholder_reason: { en: "Reason for rejection (Optional)...", zh: "拒绝理由 (可选)..." },
  
  btn_always: { en: "⚡ Always Allow", zh: "⚡ 永久允许" },
  btn_back: { en: "Back", zh: "返回" },
  btn_reject: { en: "Reject", zh: "拒绝" },
  btn_reject_confirm: { en: "Confirm Rejection", zh: "确认拒绝" },
  btn_approve: { en: "Approve", zh: "允许" },
  btn_allow_confirm: { en: "Confirm Allow", zh: "确认永久允许" },

  always_title: { en: "Remove Protection?", zh: "移除保护？" },
  always_desc_1: { en: "You are about to permanently allow", zh: "您即将把以下工具移出保护名单：" },
  always_desc_2: { en: "Future calls will execute automatically without approval.", zh: "今后 AI 调用此工具将不再经过人工审批。" }
};

export function t(key: string): string {
  const entry = LOG_MSGS[key];
  if (!entry) return key;
  return (entry as any)[i18n.lang] || entry.en;
}

// === Logger 组件 ===
export const Logger = {
  el: null as HTMLDivElement | null,
  contentEl: null as HTMLDivElement | null,

  init() {
    if (this.el) return;
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      width: "320px",
      height: "200px",
      backgroundColor: "rgba(0,0,0,0.85)",
      color: "#00ff00",
      fontFamily: "Consolas, monospace",
      fontSize: "12px",
      zIndex: "99999",
      borderRadius: "8px",
      display: "none",
      flexDirection: "column",
      border: "1px solid #333",
      backdropFilter: "blur(4px)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    });
    const header = document.createElement("div");
    header.innerText = "WebMCP Bridge Process Log";
    Object.assign(header.style, {
      padding: "6px",
      backgroundColor: "#333",
      color: "#fff",
      cursor: "move",
      display: "flex",
      justifyContent: "space-between",
    });
    const clearBtn = document.createElement("span");
    clearBtn.innerText = "🗑️";
    clearBtn.style.cursor = "pointer";
    clearBtn.onclick = () => {
        if (this.contentEl) this.contentEl.innerHTML = "";
    };
    header.appendChild(clearBtn);
    this.contentEl = document.createElement("div");
    Object.assign(this.contentEl.style, {
      flex: "1",
      overflowY: "auto",
      padding: "8px",
    });
    this.el.appendChild(header);
    this.el.appendChild(this.contentEl);
    document.body.appendChild(this.el);
    this.makeDraggable(header);
  },

  makeDraggable(headerEl: HTMLElement) {
    let isDragging = false,
      startX: number,
      startY: number,
      iLeft: number,
      iTop: number;
    headerEl.onmousedown = (e) => {
      if (!this.el) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const r = this.el.getBoundingClientRect();
      iLeft = r.left;
      iTop = r.top;
    };
    window.onmousemove = (e) => {
      if (isDragging && this.el) {
        this.el.style.left = iLeft + e.clientX - startX + "px";
        this.el.style.top = iTop + e.clientY - startY + "px";
        this.el.style.right = "auto";
      }
    };
    window.onmouseup = () => (isDragging = false);
  },

  toggle(show: boolean) {
    if (!this.el && show) this.init();
    if (this.el) this.el.style.display = show ? "flex" : "none";
  },

  log(msg: string, type: "info" | "success" | "error" | "warn" | "action" = "info") {
    if (!this.el || this.el.style.display === "none") return;
    const line = document.createElement("div");
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    let icon = "🔹",
      color = "#ddd";
    if (type === "success") {
      icon = "✅";
      color = "#4caf50";
    } else if (type === "error") {
      icon = "❌";
      color = "#f44336";
    } else if (type === "warn") {
      icon = "⚠️";
      color = "#ff9800";
    } else if (type === "action") {
      icon = "⚡";
      color = "#00bcd4";
    }
    line.innerHTML = `<span style="color:#888; font-size:10px">[${time}]</span> ${icon} <span style="color:${color}">${msg}</span>`;
    if (this.contentEl) {
        this.contentEl.appendChild(line);
        this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  },
};