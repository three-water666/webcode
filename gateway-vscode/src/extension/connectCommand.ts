import * as vscode from 'vscode';

import { t } from '../i18n';
import { getConfiguredAiSites } from '../platforms';
import { launchBridge } from './browserLauncher';
import type { GatewayServiceController } from './serviceController';
import type { AISiteConfig, CustomActionItem } from './types';

interface RegisterGatewayConnectCommandOptions {
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
    serviceController: GatewayServiceController;
}

interface OnlineMenuContext {
    currentPort: number;
    currentToken: string;
    outputChannel: vscode.OutputChannel;
    serviceController: GatewayServiceController;
}

export function registerGatewayConnectCommand(options: RegisterGatewayConnectCommandOptions): void {
    options.context.subscriptions.push(vscode.commands.registerCommand('webcode-gateway.connect', async () => {
        await handleGatewayConnectCommand(options.outputChannel, options.serviceController);
    }));
}

async function handleGatewayConnectCommand(
    outputChannel: vscode.OutputChannel,
    serviceController: GatewayServiceController
): Promise<void> {
    const state = serviceController.getState();

    // 1. Case: Starting -> Show Logs
    if (state.isStarting) {
        outputChannel.show();
        return;
    }

    // 2. Case: Offline -> Show Start Option
    if (!state.isRunning) {
        await showOfflineMenu(outputChannel, serviceController);
        return;
    }

    // 3. Case: Online -> Show Full Menu
    if (!state.currentPort || !state.currentToken) {
        // Should not happen if isRunning is true, but safe guard
        serviceController.markOffline();
        return;
    }

    await showOnlineMenu({
        currentPort: state.currentPort,
        currentToken: state.currentToken,
        outputChannel,
        serviceController
    });
}

async function showOfflineMenu(
    outputChannel: vscode.OutputChannel,
    serviceController: GatewayServiceController
): Promise<void> {
    const items: CustomActionItem[] = [
        { label: t('offline_start_label'), description: t('offline_start_desc'), action: 'start' },
        { label: t('view_logs_label'), description: t('view_logs_desc'), action: 'showLogs' },
        { label: t('configure_label'), description: t('configure_desc'), action: 'settings' }
    ];

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: t('offline_placeholder'),
        title: t('manager_title')
    });

    if (!selection) {
        return;
    }

    if (selection.action === 'start') {
        await serviceController.start();
    } else if (selection.action === 'showLogs') {
        outputChannel.show();
    } else if (selection.action === 'settings') {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'webcodeGateway');
    }
}

async function showOnlineMenu(context: OnlineMenuContext): Promise<void> {
    // 1. 从配置中读取 AI 站点列表
    const config = vscode.workspace.getConfiguration('webcodeGateway');
    const aiSites = getConfiguredAiSites(config.get<AISiteConfig[]>('aiSites'));
    const items = buildOnlineMenuItems(aiSites);

    const selection = await vscode.window.showQuickPick<CustomActionItem>(items, {
        placeHolder: t('online_placeholder'),
        title: t('online_title', { port: context.currentPort })
    });

    if (!selection) {
        return;
    }

    await handleOnlineSelection(selection, aiSites, context);
}

function buildOnlineMenuItems(aiSites: AISiteConfig[]): CustomActionItem[] {
    // 2. 动态生成快速启动项 (仅显示 showQuickLaunch 为 true 的项)
    const quickLaunchItems: CustomActionItem[] = aiSites
        .filter(site => site.showQuickLaunch === true)
        .map(site => ({
            label: t('open_label', { name: site.name }),
            description: site.address.replace(/^https?:\/\//, ''),
            target: site.address,
        }));

    // 3. 准备完整的 QuickPick 列表
    return [
        ...quickLaunchItems,
        { label: t('custom_launch_label'), description: t('custom_launch_desc'), action: 'custom' },
        { label: t('view_logs_label'), description: t('view_gateway_logs_desc'), action: 'showLogs' },
        { label: t('configure_gateway_label'), description: t('configure_gateway_desc'), action: 'settings' },
        { label: t('restart_label'), description: t('restart_desc'), action: 'restart' },
        { label: t('stop_label'), description: t('stop_desc'), action: 'stop' }
    ];
}

async function handleOnlineSelection(
    selection: CustomActionItem,
    aiSites: AISiteConfig[],
    context: OnlineMenuContext
): Promise<void> {
    // 0. 查看日志
    if (selection.action === 'showLogs') {
        context.outputChannel.show();
        return;
    }

    // 1. 设置
    if (selection.action === 'settings') {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'webcodeGateway');
        return;
    }

    // 2. 重启
    if (selection.action === 'restart') {
        await context.serviceController.restart();
        return;
    }

    // 2.5 停止
    if (selection.action === 'stop') {
        await context.serviceController.stop();
        return;
    }

    // 3. 自定义启动
    if (selection.action === 'custom') {
        await launchCustomBridge(aiSites, context.currentPort, context.currentToken);
        return;
    }

    // 4. 默认启动 (智能匹配配置)
    if (selection.target) {
        launchBridge({
            targetUrl: selection.target,
            browserMode: 'auto',
            currentPort: context.currentPort,
            currentToken: context.currentToken
        });
    }
}

async function launchCustomBridge(
    aiSites: AISiteConfig[],
    currentPort: number,
    currentToken: string
): Promise<void> {
    // Custom Launch 现在使用所有配置的 AI 站点，无论 showQuickLaunch 是否为 true
    const aiOptionsForCustomLaunch: CustomActionItem[] = aiSites.map(site => ({
        label: `$(globe) ${site.name}`,
        description: site.address,
        target: site.address,
    }));

    const aiSelection = await vscode.window.showQuickPick<CustomActionItem>(aiOptionsForCustomLaunch, {
        placeHolder: t('custom_step1')
    });
    if (!aiSelection) {
        return;
    }

    const browserOptions: CustomActionItem[] = [
        { label: t('browser_chrome'), value: 'chrome' },
        { label: t('browser_edge'), value: 'edge' },
        { label: t('browser_default'), value: 'default' }
    ];
    const browserSelection = await vscode.window.showQuickPick<CustomActionItem>(browserOptions, {
        placeHolder: t('custom_step2', { name: aiSelection.label.replace('$(globe) ', '') })
    });
    if (!browserSelection) {
        return;
    }

    launchBridge({
        targetUrl: aiSelection.target ?? "",
        browserMode: browserSelection.value ?? "",
        currentPort,
        currentToken
    });
}
