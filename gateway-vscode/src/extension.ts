import * as vscode from 'vscode';
import { GatewayManager } from './gateway';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { t } from './i18n';
import { getConfiguredAiSites } from './platforms';
import { COMMAND_SHELL_ENV } from './servers/commandShell';
import { BRANDING } from '@webcode/shared';

// 定义配置文件的 AI 站点结构
interface AISiteConfig {
    name: string;
    address: string;
    showQuickLaunch?: boolean; // 可选，默认为 true
    browser?: string; // 新增：站点专属浏览器配置 (default, chrome, edge)
    selectors?: Record<string, string>; // 新增：自定义选择器
}

// 定义统一的 QuickPickItem 接口，解决类型推断报错
// target 用于快速启动，action 用于特殊操作 (showLogs, settings, custom)
interface CustomActionItem extends vscode.QuickPickItem {
    target?: string; // 目标 URL
    action?: string; // 特殊动作
    value?: string; // 用于浏览器选择
}

interface BuiltinServerConfig {
    type?: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    disabled?: boolean;
}

const LEGACY_BUILTIN_SERVER_IDS = new Set(['filesystem', 'command', 'builtin_filesystem', 'builtin_command']);

let manager: GatewayManager;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let currentPort: number | null = null;
let currentToken: string | null = null;
let isStarting = false;
let isRunning = false;
let skillWatchers: vscode.Disposable[] = [];

// eslint-disable-next-line @typescript-eslint/require-await
export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel(t('output_channel_name'));
    // outputChannel.show(true); // 静默启动，不自动弹出面板
    outputChannel.appendLine("🚀 MCP Gateway Extension Activating...");

    manager = new GatewayManager(outputChannel, context.extensionPath, context, () => {
        // Auto-stop callback
        isRunning = false;
        updateStatusBar(false);
        vscode.window.showInformationMessage(t('auto_stop_message'));
        outputChannel.appendLine("💤 Auto-shutdown triggered due to inactivity.");
    });

    const disposeSkillWatchers = () => {
        vscode.Disposable.from(...skillWatchers).dispose();
        skillWatchers = [];
    };

    const refreshSkillWatchers = () => {
        disposeSkillWatchers();

        const config = vscode.workspace.getConfiguration('webcodeGateway');
        const skillDirectories = config.get<string[]>('skillDirectories') ?? [];
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        const normalizedDirectories = Array.from(new Set(
            ['.agents/skills', '.codex/skills', 'skills', ...skillDirectories]
                .map(dir => dir.trim())
                .filter(Boolean)
        ));

        const invalidateSkills = (reason: string) => {
            manager.invalidateSkillCache(reason);
        };

        for (const folder of workspaceFolders) {
            for (const relativeDir of normalizedDirectories) {
                const pattern = new vscode.RelativePattern(folder, `${relativeDir.replace(/[\\/]+/g, '/')}/**`);
                const watcher = vscode.workspace.createFileSystemWatcher(pattern);

                watcher.onDidCreate(uri => invalidateSkills(`created ${vscode.workspace.asRelativePath(uri)}`));
                watcher.onDidChange(uri => invalidateSkills(`changed ${vscode.workspace.asRelativePath(uri)}`));
                watcher.onDidDelete(uri => invalidateSkills(`deleted ${vscode.workspace.asRelativePath(uri)}`));

                skillWatchers.push(watcher);
            }
        }

        context.subscriptions.push(...skillWatchers);
    };

    refreshSkillWatchers();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        refreshSkillWatchers();
        manager.invalidateSkillCache('workspace folders changed');
    }));

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'webcode-gateway.connect';
    context.subscriptions.push(statusBarItem);

    const startService = async () => {
        // Set Loading State
        isStarting = true;
        updateStatusBar(true, undefined, true);

        const config = vscode.workspace.getConfiguration('webcodeGateway');
        const portConfig = config.get<number>('port') ?? 34567;
        const configuredCommandShellPath = config.get<string>('commandShell.path')?.trim();
        const commandShellPath = configuredCommandShellPath === '' ? undefined : configuredCommandShellPath;
        const customServers = filterCustomServers(config.get<Record<string, BuiltinServerConfig>>('servers') ?? {}, outputChannel);
        const mcpServers = {
            ...getBuiltinServers(context.extensionPath, outputChannel, commandShellPath),
            ...customServers
        };
        const skillDirectories = config.get<string[]>('skillDirectories') ?? [];
        const lastUsedPort = context.workspaceState.get<number>('mcp.lastPort');

        // [Security] Extract Allowed Origins from AI Sites config
        const aiSites = getConfiguredAiSites(config.get<AISiteConfig[]>('aiSites'));
        const allowedOrigins = aiSites.map(site => {
            try {
                return new URL(site.address).origin;
            } catch {
                return '';
            }
        }).filter(origin => origin !== '');

        try {
            const result = await manager.start({
                port: portConfig,
                preferredPort: lastUsedPort,
                mcpServers,
                allowedOrigins,
                aiSites,
                skillDirectories,
                commandShellPath
            });

            currentPort = result.port;
            currentToken = result.token;

            if (currentPort !== lastUsedPort) {
                await context.workspaceState.update('mcp.lastPort', currentPort);
            }

            isStarting = false;
            isRunning = true;
            updateStatusBar(true, currentPort);

        } catch (e: any) {
            vscode.window.showErrorMessage(t('start_failed', { message: e.message }));
            isStarting = false;
            isRunning = false;
            updateStatusBar(false);
        }
    };

    // Fix: Register command BEFORE starting service to handle clicks during startup
    const stopService = async () => {
        await manager.stop();
        isRunning = false;
        currentPort = null;
        currentToken = null;
        updateStatusBar(false);
        vscode.window.showInformationMessage(t('server_stopped'));
    };

    // Command: Copy Context (File Path + Selection)
    context.subscriptions.push(vscode.commands.registerCommand('webcode-gateway.copyContext', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        if (!text) {
            return;
        }

        // Get relative path (e.g., "src/extension.ts")
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        
        // Format the clipboard content
        const contentWithContext = `File: ${filePath}\n\n${text}`;

        await vscode.env.clipboard.writeText(contentWithContext);
        vscode.window.setStatusBarMessage(t('context_copied', { filePath }), 3000);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('webcode-gateway.connect', async () => {
        // 1. Case: Starting -> Show Logs
        if (isStarting) {
            outputChannel.show();
            return;
        }

        // 2. Case: Offline -> Show Start Option
        if (!isRunning) {
            const items: CustomActionItem[] = [
                { label: t('offline_start_label'), description: t('offline_start_desc'), action: 'start' },
                { label: t('view_logs_label'), description: t('view_logs_desc'), action: 'showLogs' },
                { label: t('configure_label'), description: t('configure_desc'), action: 'settings' }
            ];
            
            const selection = await vscode.window.showQuickPick(items, {
                placeHolder: t('offline_placeholder'),
                title: t('manager_title')
            });
            
            if (!selection) {return;}
            
            if (selection.action === 'start') {
                await startService();
            } else if (selection.action === 'showLogs') {
                outputChannel.show();
            } else if (selection.action === 'settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'webcodeGateway');
            }
            return;
        }

        // 3. Case: Online -> Show Full Menu
        if (!currentPort || !currentToken) {
            // Should not happen if isRunning is true, but safe guard
            isRunning = false;
            updateStatusBar(false);
            return;
        }

        // 1. 从配置中读取 AI 站点列表
        const config = vscode.workspace.getConfiguration('webcodeGateway');
        const aiSites = getConfiguredAiSites(config.get<AISiteConfig[]>('aiSites'));

        // 2. 动态生成快速启动项 (仅显示 showQuickLaunch 为 true 的项)
        const quickLaunchItems: CustomActionItem[] = aiSites
            .filter(site => site.showQuickLaunch === true)
            .map(site => ({
                label: t('open_label', { name: site.name }),
                description: site.address.replace(/^https?:\/\//, ''),
                target: site.address,
            }));

        // 3. 准备完整的 QuickPick 列表
        const items: CustomActionItem[] = [
            ...quickLaunchItems,
            { label: t('custom_launch_label'), description: t('custom_launch_desc'), action: 'custom' },
            { label: t('view_logs_label'), description: t('view_gateway_logs_desc'), action: 'showLogs' },
            { label: t('configure_gateway_label'), description: t('configure_gateway_desc'), action: 'settings' },
            { label: t('restart_label'), description: t('restart_desc'), action: 'restart' },
            { label: t('stop_label'), description: t('stop_desc'), action: 'stop' }
        ];

        const selection = await vscode.window.showQuickPick<CustomActionItem>(items, {
            placeHolder: t('online_placeholder'),
            title: t('online_title', { port: currentPort })
        });

        if (!selection) { return; }

        // 0. 查看日志
        if (selection.action === 'showLogs') {
            outputChannel.show();
            return;
        }

        // 1. 设置
        if (selection.action === 'settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'webcodeGateway');
            return;
        }

        // 2. 重启
        if (selection.action === 'restart') {
            outputChannel.appendLine("🔄 Manual restart triggered.");
            await manager.stop();
            await startService();
            vscode.window.showInformationMessage(t('server_restarted'));
            return;
        }

        // 2.5 停止
        if (selection.action === 'stop') {
            await stopService();
            return;
        }

        // 3. 自定义启动
        if (selection.action === 'custom') {
            // Custom Launch 现在使用所有配置的 AI 站点，无论 showQuickLaunch 是否为 true
            const aiOptionsForCustomLaunch: CustomActionItem[] = aiSites.map(site => ({
                label: `$(globe) ${site.name}`,
                description: site.address,
                target: site.address,
            }));

            const aiSelection = await vscode.window.showQuickPick<CustomActionItem>(aiOptionsForCustomLaunch, {
                placeHolder: t('custom_step1')
            });
            if (!aiSelection) { return; }

            const browserOptions: CustomActionItem[] = [
                { label: t('browser_chrome'), value: 'chrome' },
                { label: t('browser_edge'), value: 'edge' },
                { label: t('browser_default'), value: 'default' }
            ];
            const browserSelection = await vscode.window.showQuickPick<CustomActionItem>(browserOptions, {
                placeHolder: t('custom_step2', { name: aiSelection.label.replace('$(globe) ', '') })
            });
            if (!browserSelection) { return; }

            launchBridge(aiSelection.target ?? "", browserSelection.value ?? "");
            return;
        }

        // 4. 默认启动 (智能匹配配置)
        if (selection.target) {
            launchBridge(selection.target, 'auto');
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (
            e.affectsConfiguration('webcodeGateway.port') ||
            e.affectsConfiguration('webcodeGateway.servers') ||
            e.affectsConfiguration('webcodeGateway.skillDirectories')
        ) {
            if (e.affectsConfiguration('webcodeGateway.skillDirectories')) {
                refreshSkillWatchers();
                manager.invalidateSkillCache('skillDirectories configuration changed');
            }
            if (isRunning) {
                outputChannel.appendLine("⚙️ Server configuration changed, restarting...");
                await startService();
            }
        }
    }));

    // Initialize in OFF state
    updateStatusBar(false, undefined, false);
    // Do not auto-start
}

function getBuiltinServers(
    extensionPath: string,
    output: vscode.OutputChannel,
    commandShellPath?: string
): Record<string, BuiltinServerConfig> {
    const filesystemEntry = path.join(extensionPath, 'dist', 'filesystemServer.js');
    const commandServerEnv = commandShellPath ? { [COMMAND_SHELL_ENV]: commandShellPath } : undefined;

    if (!fs.existsSync(filesystemEntry)) {
        output.appendLine(
            `[Builtin] Missing bundled filesystem server at ${filesystemEntry}. ` +
            `The extension package or build output is incomplete.`
        );
    }

    return {
        builtin_filesystem: {
            command: 'node',
            args: [
                filesystemEntry,
                '.'
            ]
        },
        builtin_command: {
            command: 'node',
            args: [
                `${extensionPath}/dist/commandServer.js`,
                '--project-root',
                '.'
            ],
            env: commandServerEnv
        }
    };
}

function filterCustomServers(
    servers: Record<string, BuiltinServerConfig>,
    output: vscode.OutputChannel
): Record<string, BuiltinServerConfig> {
    const filtered = Object.fromEntries(
        Object.entries(servers).filter(([serverId]) => {
            if (LEGACY_BUILTIN_SERVER_IDS.has(serverId)) {
                output.appendLine(`[Builtin] Ignoring legacy built-in server config '${serverId}'. Built-in servers are now managed automatically.`);
                return false;
            }
            return true;
        })
    );

    return filtered;
}

function launchBridge(targetUrl: string, browserMode: string) {
    const bridgeUrl = `http://127.0.0.1:${currentPort}/bridge?token=${currentToken}&target=${encodeURIComponent(targetUrl)}`;

    const config = vscode.workspace.getConfiguration('webcodeGateway');
    let finalBrowser = 'default';

    if (browserMode === 'auto') {
        // 新逻辑：优先检查 aiSites 中是否有配置 browser
        const aiSites = getConfiguredAiSites(config.get<AISiteConfig[]>('aiSites'));
        const matchedSite = aiSites.find(site => site.address === targetUrl);

        if (matchedSite?.browser && matchedSite.browser !== 'default') {
            finalBrowser = matchedSite.browser;
        } else {
            // 如果没有特定配置，使用全局默认设置
            finalBrowser = config.get<string>('browser') ?? 'default';
        }
    } else {
        // 手动指定模式（Custom Launch）
        finalBrowser = browserMode;
    }

    openBrowser(bridgeUrl, finalBrowser);
}

function updateStatusBar(online: boolean, port?: number, isLoading: boolean = false) {
    if (isLoading) {
        statusBarItem.text = t('status_starting');
        statusBarItem.tooltip = t('status_starting_tooltip');
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (online && port) {
        statusBarItem.text = `$(rocket) ${BRANDING.productName}: ${port}`;
        statusBarItem.tooltip = t('status_online_tooltip');
        statusBarItem.backgroundColor = undefined;
    } else {
        // Default OFF state
        statusBarItem.text = t('status_offline');
        statusBarItem.tooltip = t('status_offline_tooltip');
        statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.show();
}

function openBrowser(url: string, browserType: string) {
    const platform = os.platform();
    let command = '';

    if (browserType === 'default') {
        vscode.env.openExternal(vscode.Uri.parse(url));
        return;
    }

    if (platform === 'win32') {
        if (browserType === 'chrome') {
            command = `start chrome "${url}"`;
        } else if (browserType === 'edge') {
            command = `start msedge "${url}"`;
        }
    } else if (platform === 'darwin') {
        if (browserType === 'chrome') {
            command = `open -a "Google Chrome" "${url}"`;
        }
        else if (browserType === 'edge') {
            command = `open -a "Microsoft Edge" "${url}"`;
        }
    } else {
        if (browserType === 'chrome') {
            command = `google-chrome "${url}"`;
        } else {
            command = `xdg-open "${url}"`;
        }
    }

    if (command) {
        exec(command, (err) => {
            if (err) {
                vscode.window.showErrorMessage(t('open_browser_failed', { message: err.message }));
            }
        });
    } else {
        vscode.env.openExternal(vscode.Uri.parse(url));
    }
}
