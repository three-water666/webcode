import * as vscode from 'vscode';

type Locale = 'en' | 'zh';

const locale: Locale = vscode.env.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';

const messages = {
    en: {
        output_channel_name: 'MCP Gateway',
        auto_stop_message: 'WebMCP Server stopped due to inactivity (30m).',
        start_failed: 'Failed to start MCP Gateway: {message}',
        server_stopped: 'WebMCP Server Stopped',
        context_copied: '$(check) Context copied: {filePath}',
        offline_start_label: '$(play) Turn On WebMCP',
        offline_start_desc: 'Start the local MCP server',
        view_logs_label: '$(output) View Logs',
        view_logs_desc: 'Show output panel',
        configure_label: '$(settings-gear) Configure',
        configure_desc: 'Open settings',
        offline_placeholder: 'WebMCP is Offline',
        manager_title: 'WebMCP Manager',
        open_label: '$(globe) Open {name}',
        custom_launch_label: '$(run) Custom Launch...',
        custom_launch_desc: 'Select AI and Browser manually',
        view_gateway_logs_desc: 'Show MCP Gateway output panel',
        configure_gateway_label: '$(settings-gear) Configure Gateway',
        configure_gateway_desc: 'Quick access to MCP Gateway settings',
        restart_label: '$(refresh) Restart Server',
        restart_desc: 'Restart local gateway',
        stop_label: '$(stop) Turn Off WebMCP',
        stop_desc: 'Stop the local server',
        online_placeholder: 'Select AI Platform or Action',
        online_title: 'WebMCP (Port: {port})',
        server_restarted: 'Server Restarted',
        custom_step1: 'Step 1: Select AI Platform',
        browser_chrome: '$(browser) Google Chrome',
        browser_edge: '$(browser) Microsoft Edge',
        browser_default: '$(terminal) System Default',
        custom_step2: 'Step 2: Open {name} in...',
        status_starting: '$(sync~spin) WebMCP: Starting...',
        status_starting_tooltip: 'Gateway is initializing...',
        status_online_tooltip: 'Click to connect AI',
        status_offline: '$(circle-slash) WebMCP: OFF',
        status_offline_tooltip: 'Click to Start WebMCP Server',
        open_browser_failed: 'Failed to open browser: {message}',
    },
    zh: {
        output_channel_name: 'MCP Gateway',
        auto_stop_message: 'WebMCP 服务因 30 分钟无活动已停止。',
        start_failed: '启动 MCP Gateway 失败：{message}',
        server_stopped: 'WebMCP 服务已停止',
        context_copied: '$(check) 已复制上下文：{filePath}',
        offline_start_label: '$(play) 启动 WebMCP',
        offline_start_desc: '启动本地 MCP 服务',
        view_logs_label: '$(output) 查看日志',
        view_logs_desc: '显示输出面板',
        configure_label: '$(settings-gear) 配置',
        configure_desc: '打开设置',
        offline_placeholder: 'WebMCP 当前离线',
        manager_title: 'WebMCP 管理器',
        open_label: '$(globe) 打开 {name}',
        custom_launch_label: '$(run) 自定义启动...',
        custom_launch_desc: '手动选择 AI 和浏览器',
        view_gateway_logs_desc: '显示 MCP Gateway 输出面板',
        configure_gateway_label: '$(settings-gear) 配置 Gateway',
        configure_gateway_desc: '快速打开 MCP Gateway 设置',
        restart_label: '$(refresh) 重启服务',
        restart_desc: '重启本地网关',
        stop_label: '$(stop) 关闭 WebMCP',
        stop_desc: '停止本地服务',
        online_placeholder: '选择 AI 平台或操作',
        online_title: 'WebMCP（端口：{port}）',
        server_restarted: '服务已重启',
        custom_step1: '第 1 步：选择 AI 平台',
        browser_chrome: '$(browser) Google Chrome',
        browser_edge: '$(browser) Microsoft Edge',
        browser_default: '$(terminal) 系统默认',
        custom_step2: '第 2 步：使用以下浏览器打开 {name}...',
        status_starting: '$(sync~spin) WebMCP：启动中...',
        status_starting_tooltip: '网关正在初始化...',
        status_online_tooltip: '点击连接 AI',
        status_offline: '$(circle-slash) WebMCP：关闭',
        status_offline_tooltip: '点击启动 WebMCP 服务',
        open_browser_failed: '打开浏览器失败：{message}',
    }
} as const;

type MessageKey = keyof typeof messages.en;

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
    let template: string = messages[locale][key] ?? messages.en[key];
    for (const [name, value] of Object.entries(params)) {
        template = template.replaceAll(`{${name}}`, String(value));
    }
    return template;
}
