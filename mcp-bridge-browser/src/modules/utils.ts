interface I18nState {
  lang: string;
  resources: {
    prompt: string | null;
    train: string | null;
    error: string | null;
    init: string | null;
  };
}

// === 国际化资源 ===
export const i18n: I18nState = {
  lang: navigator.language.startsWith("zh") ? "zh" : "en",
  resources: { prompt: null, train: null, error: null, init: null },
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
  return (entry as any)[i18n.lang] || entry.en;
}

// === Logger 组件 ===
export const Logger = {
  el: null as HTMLDivElement | null,
  contentEl: null as HTMLDivElement | null,

  init() {
    if (this.el) {return;}

    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      width: "320px",
      height: "200px",
      zIndex: "2147483647",
      display: "none",
    });

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent =       ':host{all:initial;color-scheme:dark;}*{box-sizing:border-box;}.logger{width:320px;height:200px;background:rgba(0,0,0,0.85);color:#00ff00;font-family:Consolas,"SFMono-Regular",Menlo,monospace;font-size:12px;border-radius:8px;display:flex;flex-direction:column;border:1px solid #333;backdrop-filter:blur(4px);box-shadow:0 4px 12px rgba(0,0,0,0.5);overflow:hidden;}.header{padding:6px;background:#333;color:#fff;cursor:move;display:flex;justify-content:space-between;align-items:center;user-select:none;}.clear{cursor:pointer;}.content{flex:1;overflow-y:auto;padding:8px;}.line{margin-bottom:4px;line-height:1.4;word-break:break-word;}.time{color:#888;font-size:10px;}';

    const panel = document.createElement("div");
    panel.className = "logger";

    const header = document.createElement("div");
    header.className = "header";
    header.innerText = "WebMCP Bridge Process Log";

    const clearBtn = document.createElement("span");
    clearBtn.className = "clear";
    clearBtn.innerText = "🗑️";
    clearBtn.onclick = () => {
      if (this.contentEl) {this.contentEl.innerHTML = "";}
    };

    this.contentEl = document.createElement("div");
    this.contentEl.className = "content";

    header.appendChild(clearBtn);
    panel.appendChild(header);
    panel.appendChild(this.contentEl);
    shadow.appendChild(style);
    shadow.appendChild(panel);
    document.body.appendChild(host);

    this.el = host;
    this.makeDraggable(header);
  },

  makeDraggable(headerEl: HTMLElement) {
    let isDragging = false,
      startX: number,
      startY: number,
      iLeft: number,
      iTop: number;
    headerEl.onmousedown = (e) => {
      if (!this.el) {return;}
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
    if (!this.el && show) {this.init();}
    if (this.el) {this.el.style.display = show ? "block" : "none";}
  },

  log(msg: string, type: "info" | "success" | "error" | "warn" | "action" = "info") {
    if (!this.el || this.el.style.display === "none") {return;}
    const line = document.createElement("div");
    line.className = "line";
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
    line.innerHTML = `<span class="time">[${time}]</span> ${icon} <span style="color:${color}">${msg}</span>`;
    if (this.contentEl) {
      this.contentEl.appendChild(line);
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  },
};
