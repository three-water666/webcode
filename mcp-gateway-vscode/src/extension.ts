import * as vscode from 'vscode';
import { GatewayManager } from './gateway';
import { exec } from 'child_process';
import * as os from 'os';

// 定义配置文件的 AI 站点结构
interface AISiteConfig {
    name: string;
    address: string;
    showQuickLaunch?: boolean; // 可选，默认为 true
    browser?: string; // 新增：站点专属浏览器配置 (default, chrome, edge)
}

// 定义统一的 QuickPickItem 接口，解决类型推断报错
// target 用于快速启动，action 用于特殊操作 (showLogs, settings, custom)
interface CustomActionItem extends vscode.QuickPickItem {
    target?: string; // 目标 URL
    action?: string; // 特殊动作
    value?: string; // 用于浏览器选择
}

let manager: GatewayManager;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let currentPort: number | null = null;
let currentToken: string | null = null;
let isStarting = false;
let isRunning = false;

export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("MCP Gateway");
    // outputChannel.show(true); // 静默启动，不自动弹出面板
    outputChannel.appendLine("🚀 MCP Gateway Extension Activating...");

    manager = new GatewayManager(outputChannel, context.extensionPath, context, () => {
        // Auto-stop callback
        isRunning = false;
        updateStatusBar(false);
        vscode.window.showInformationMessage("WebMCP Server stopped due to inactivity (30m).");
        outputChannel.appendLine("💤 Auto-shutdown triggered due to inactivity.");
    });

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'mcp-gateway.connect';
    context.subscriptions.push(statusBarItem);

    const startService = async () => {
        // Set Loading State
        isStarting = true;
        updateStatusBar(true, undefined, true);

        const config = vscode.workspace.getConfiguration('mcpGateway');
        const portConfig = config.get<number>('port') || 34567;
        const mcpServers = config.get<any>('servers') || {};
        const lastUsedPort = context.workspaceState.get<number>('mcp.lastPort');

        // [Security] Extract Allowed Origins from AI Sites config
        const aiSites = config.get<AISiteConfig[]>('aiSites') || [];
        const allowedOrigins = aiSites.map(site => {
            try {
                return new URL(site.address).origin;
            } catch (e) {
                return '';
            }
        }).filter(origin => origin !== '');

        try {
            const result = await manager.start({
                port: portConfig,
                preferredPort: lastUsedPort,
                mcpServers,
                allowedOrigins
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
            vscode.window.showErrorMessage(`Failed to start MCP Gateway: ${e.message}`);
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
        vscode.window.showInformationMessage("WebMCP Server Stopped");
    };

    context.subscriptions.push(vscode.commands.registerCommand('mcp-gateway.connect', async () => {
        // 1. Case: Starting -> Show Logs
        if (isStarting) {
            outputChannel.show();
            return;
        }

        // 2. Case: Offline -> Show Start Option
        if (!isRunning) {
            const items: CustomActionItem[] = [
                { label: '$(play) Turn On WebMCP', description: 'Start the local MCP server', action: 'start' },
                { label: '$(output) View Logs', description: 'Show output panel', action: 'showLogs' },
                { label: '$(settings-gear) Configure', description: 'Open settings', action: 'settings' }
            ];
            
            const selection = await vscode.window.showQuickPick(items, {
                placeHolder: 'WebMCP is Offline',
                title: 'WebMCP Manager'
            });
            
            if (!selection) return;
            
            if (selection.action === 'start') {
                await startService();
            } else if (selection.action === 'showLogs') {
                outputChannel.show();
            } else if (selection.action === 'settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'mcpGateway');
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
        const config = vscode.workspace.getConfiguration('mcpGateway');
        const aiSites = config.get<AISiteConfig[]>('aiSites') || [];

        // 2. 动态生成快速启动项 (仅显示 showQuickLaunch 为 true 的项)
        const quickLaunchItems: CustomActionItem[] = aiSites
            .filter(site => site.showQuickLaunch === true)
            .map(site => ({
                label: `$(globe) Open ${site.name}`,
                description: site.address.replace(/^https?:\/\//, ''),
                target: site.address,
            }));

        // 3. 准备完整的 QuickPick 列表
        const items: CustomActionItem[] = [
            ...quickLaunchItems,
            { label: '$(run) Custom Launch...', description: 'Select AI and Browser manually', action: 'custom' },
            { label: '$(output) View Logs', description: 'Show MCP Gateway output panel', action: 'showLogs' },
            { label: '$(settings-gear) Configure Gateway', description: 'Quick access to MCP Gateway settings', action: 'settings' },
            { label: '$(refresh) Restart Server', description: 'Restart local gateway', action: 'restart' },
            { label: '$(stop) Turn Off WebMCP', description: 'Stop the local server', action: 'stop' }
        ];

        const selection = await vscode.window.showQuickPick<CustomActionItem>(items, {
            placeHolder: 'Select AI Platform or Action',
            title: `WebMCP (Port: ${currentPort})`
        });

        if (!selection) { return; }

        // 0. 查看日志
        if (selection.action === 'showLogs') {
            outputChannel.show();
            return;
        }

        // 1. 设置
        if (selection.action === 'settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'mcpGateway');
            return;
        }

        // 2. 重启
        if (selection.action === 'restart') {
            outputChannel.appendLine("🔄 Manual restart triggered.");
            await manager.stop();
            await startService();
            vscode.window.showInformationMessage("Server Restarted");
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
                placeHolder: 'Step 1: Select AI Platform'
            });
            if (!aiSelection) { return; }

            const browserOptions: CustomActionItem[] = [
                { label: '$(browser) Google Chrome', value: 'chrome' },
                { label: '$(browser) Microsoft Edge', value: 'edge' },
                { label: '$(terminal) System Default', value: 'default' }
            ];
            const browserSelection = await vscode.window.showQuickPick<CustomActionItem>(browserOptions, {
                placeHolder: `Step 2: Open ${aiSelection.label.replace('$(globe) ', '')} in...`
            });
            if (!browserSelection) { return; }

            launchBridge(aiSelection.target!, browserSelection.value!);
            return;
        }

        // 4. 默认启动 (智能匹配配置)
        if (selection.target) {
            launchBridge(selection.target, 'auto');
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('mcpGateway.port') || e.affectsConfiguration('mcpGateway.servers')) {
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

function launchBridge(targetUrl: string, browserMode: string) {
    const bridgeUrl = `http://127.0.0.1:${currentPort}/bridge?token=${currentToken}&target=${encodeURIComponent(targetUrl)}`;

    const config = vscode.workspace.getConfiguration('mcpGateway');
    let finalBrowser = 'default';

    if (browserMode === 'auto') {
        // 新逻辑：优先检查 aiSites 中是否有配置 browser
        const aiSites = config.get<AISiteConfig[]>('aiSites') || [];
        const matchedSite = aiSites.find(site => site.address === targetUrl);

        if (matchedSite && matchedSite.browser && matchedSite.browser !== 'default') {
            finalBrowser = matchedSite.browser;
        } else {
            // 如果没有特定配置，使用全局默认设置
            finalBrowser = config.get<string>('browser') || 'default';
        }
    } else {
        // 手动指定模式（Custom Launch）
        finalBrowser = browserMode;
    }

    openBrowser(bridgeUrl, finalBrowser);
}

function updateStatusBar(online: boolean, port?: number, isLoading: boolean = false) {
    if (isLoading) {
        statusBarItem.text = `$(sync~spin) WebMCP: Starting...`;
        statusBarItem.tooltip = "Gateway is initializing...";
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (online && port) {
        statusBarItem.text = `$(rocket) WebMCP: ${port}`;
        statusBarItem.tooltip = "Click to connect AI";
        statusBarItem.backgroundColor = undefined;
    } else {
        // Default OFF state
        statusBarItem.text = `$(circle-slash) WebMCP: OFF`;
        statusBarItem.tooltip = "Click to Start WebMCP Server";
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
                vscode.window.showErrorMessage(`Failed to open browser: ${err.message}`);
            }
        });
    } else {
        vscode.env.openExternal(vscode.Uri.parse(url));
    }
}
