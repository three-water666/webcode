import * as vscode from 'vscode';
import { GatewayManager } from './gateway';
import { BrowserManager } from './browserManager';

// 定义配置文件的 AI 站点结构
interface AISiteConfig {
    name: string;
    address: string;
    showQuickLaunch?: boolean;
    browser?: string;
}

interface CustomActionItem extends vscode.QuickPickItem {
    target?: string;
    action?: string;
    value?: string;
}

let manager: GatewayManager;
let browserManager: BrowserManager;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("MCP Gateway");
    outputChannel.appendLine("🚀 MCP Gateway Extension Activating (Native Mode)...");

    manager = new GatewayManager(outputChannel, context.extensionPath);
    browserManager = new BrowserManager(manager, outputChannel);

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'mcp-gateway.connect';
    context.subscriptions.push(statusBarItem);

    const startService = async () => {
        // 🔄 立即显示 Loading 状态
        statusBarItem.text = `$(sync~spin) WebMCP: Starting...`;
        statusBarItem.tooltip = "Connecting to local MCP servers...";
        statusBarItem.backgroundColor = undefined;
        statusBarItem.show();

        const config = vscode.workspace.getConfiguration('mcpGateway');
        const mcpServers = config.get<any>('servers') || {};

        try {
            // 启动 Gateway 连接本地 MCP Server (Native Mode)
            await manager.start({
                mcpServers
            });
            updateStatusBar(true);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to start MCP Gateway: ${e.message}`);
            updateStatusBar(false);
        }
    };

    await startService();

    context.subscriptions.push(vscode.commands.registerCommand('mcp-gateway.connect', async () => {
        // 1. 从配置中读取 AI 站点列表
        const config = vscode.workspace.getConfiguration('mcpGateway');
        const aiSites = config.get<AISiteConfig[]>('aiSites') || [];

        // 2. 动态生成快速启动项
        const quickLaunchItems: CustomActionItem[] = aiSites
            .filter(site => site.showQuickLaunch !== false)
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
            { label: '$(refresh) Restart Service', description: 'Reconnect to MCP servers', action: 'restart' }
        ];

        const selection = await vscode.window.showQuickPick<CustomActionItem>(items, {
            placeHolder: 'Select AI Platform to Launch (Native Control)',
            title: `WebMCP: Native Mode`
        });

        if (!selection) { return; }

        if (selection.action === 'showLogs') {
            outputChannel.show();
            return;
        }

        if (selection.action === 'restart') {
            outputChannel.appendLine("🔄 Manual restart triggered.");
            await manager.stop();
            await startService();
            vscode.window.showInformationMessage("Service Restarted");
            return;
        }

        if (selection.action === 'custom') {
            const aiOptions: CustomActionItem[] = aiSites.map(site => ({
                label: `$(globe) ${site.name}`,
                description: site.address,
                target: site.address,
            }));
            const aiSel = await vscode.window.showQuickPick(aiOptions, { placeHolder: 'Select AI Platform' });
            if (!aiSel) return;

            const browserSel = await vscode.window.showQuickPick([
                { label: '$(browser) Google Chrome', value: 'chrome' },
                { label: '$(browser) Microsoft Edge', value: 'edge' }
            ], { placeHolder: 'Select Browser' });
            if (!browserSel) return;

            await launchAI(aiSel.target!, browserSel.value!);
            return;
        }

        if (selection.target) {
            await launchAI(selection.target, 'auto');
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('mcpGateway.servers')) {
            outputChannel.appendLine("⚙️ Configuration changed, reloading servers...");
            await startService();
        }
    }));
}

async function launchAI(targetUrl: string, browserMode: string) {
    const config = vscode.workspace.getConfiguration('mcpGateway');
    let finalBrowser = 'chrome';

    // 智能判定浏览器
    if (browserMode === 'auto') {
        const aiSites = config.get<AISiteConfig[]>('aiSites') || [];
        const matchedSite = aiSites.find(site => site.address === targetUrl);
        if (matchedSite && matchedSite.browser && matchedSite.browser !== 'default') {
            finalBrowser = matchedSite.browser;
        } else {
            const globalDefault = config.get<string>('browser');
            if (globalDefault && globalDefault !== 'default') {
                finalBrowser = globalDefault;
            }
        }
    } else {
        finalBrowser = browserMode;
    }

    // 强制转换为受支持的类型
    if (finalBrowser !== 'edge') finalBrowser = 'chrome';

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Launching ${finalBrowser === 'chrome' ? 'Chrome' : 'Edge'}...`,
        cancellable: false
    }, async () => {
        try {
            await browserManager.launch(targetUrl, finalBrowser as 'chrome' | 'edge');
        } catch (e: any) {
            vscode.window.showErrorMessage(`Launch Failed: ${e.message}`);
        }
    });
}

function updateStatusBar(online: boolean) {
    if (online) {
        statusBarItem.text = `$(rocket) WebMCP: Active`;
        statusBarItem.tooltip = "Native Mode Ready. Click to launch AI.";
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = `$(alert) WebMCP: Error`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    statusBarItem.show();
}