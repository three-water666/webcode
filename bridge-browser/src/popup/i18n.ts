import { BRANDING } from '@webcode/shared';

export type PopupTranslator = (key: string) => string;

const UI: Record<string, Record<string, string>> = {
  en: {
    title: BRANDING.bridgeName,
    connected_text: "✅ Connected to VS Code",
    port_label: "Port",
    manual_init: "Manual Initialization",
    manual_init_title: "Add initialization context to the current input",
    manual_init_running: "Initializing...",
    manual_init_done: "Initialization added",
    manual_init_attached: "Initialization attached",
    manual_init_failed: "Initialization failed",
    manual_init_unavailable: "Cannot initialize here",
    auto_send: "Auto Send Message",
    auto_approve_tools: "Auto-Approve All Tools",
    show_log: "Show Floating Log",
    session_preset: "New Session Preset",
    session_preset_title: "Show settings used when a new browser session is created",
    session_preset_hint: "Applies only to new sessions. The current session setting stays unchanged.",
    checking_connection: "Checking VS Code connection...",
    default_auto_approve_tools: "Auto-Approve All Tools",
    disconnected: "🔴 Disconnected from VS Code",
    suspended: "⏸️ Connection paused on this page",
    suspended_hint: "Return to the connected site to resume automatically. Local tools stay disabled here.",
    connection_expired: "🔴 VS Code connection expired",
    expired_action_title: "Reconnect from VS Code",
    expired_action_desc: `The VS Code gateway may have stopped after inactivity, or this browser session is no longer valid. In VS Code, click ${BRANDING.productName} in the status bar, start the service, then launch the site again.`,
    installed_title: "VS Code extension installed?",
    installed_desc: `Click ${BRANDING.productName} in the VS Code status bar (bottom right) and follow the steps to launch.`,
    not_installed_title: "VS Code extension not installed?",
    marketplace_hint: "Search in VS Code Marketplace:",
  },
  zh: {
    title: BRANDING.bridgeName,
    connected_text: "✅ 已连接到 VS Code",
    port_label: "端口",
    manual_init: "手动初始化",
    manual_init_title: "将初始化上下文追加到当前输入框",
    manual_init_running: "初始化中...",
    manual_init_done: "初始化上下文已添加",
    manual_init_attached: "初始化上下文已作为 txt 附件添加",
    manual_init_failed: "初始化失败",
    manual_init_unavailable: "当前页面无法初始化",
    auto_send: "自动发送消息",
    auto_approve_tools: "所有工具无需审批",
    show_log: "显示悬浮日志",
    session_preset: "新会话预设",
    session_preset_title: "显示新建浏览器会话时使用的设置",
    session_preset_hint: "只影响之后新开的会话，不改变当前会话。",
    checking_connection: "正在检查 VS Code 连接...",
    default_auto_approve_tools: "所有工具无需审批",
    disconnected: "🔴 未连接到 VS Code",
    suspended: "⏸️ 当前页面连接已暂停",
    suspended_hint: "回到已连接的网站后会自动恢复；本页面无法调用本地工具。",
    connection_expired: "🔴 VS Code 连接已失效",
    expired_action_title: "从 VS Code 重新连接",
    expired_action_desc: `${BRANDING.productName} 网关可能已因长时间无活动自动停止，或当前浏览器会话已失效。请回到 VS Code 右下角点击 ${BRANDING.productName}，启动服务后重新打开当前网站。`,
    installed_title: "VS Code 插件已安装？",
    installed_desc: `点击 VS Code 右下角状态栏中的 ${BRANDING.productName}，并按提示启动服务。`,
    not_installed_title: "VS Code 插件未安装？",
    marketplace_hint: "在 VS Code 扩展市场中搜索：",
  },
};

export function createPopupTranslator(): PopupTranslator {
  const lang = navigator.language.startsWith("zh") ? "zh" : "en";
  return (key: string) => UI[lang][key] || UI.en[key];
}

export function renderInstalledDescription(t: PopupTranslator): string {
  return t("installed_desc").replace(
    BRANDING.productName,
    `<span style="color: #3498db; font-weight: bold">${BRANDING.productName}</span>`
  );
}
