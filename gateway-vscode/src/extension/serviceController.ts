import * as vscode from 'vscode';

import type { GatewayManager } from '../gateway';
import { t } from '../i18n';
import { getConfiguredAiSites } from '../platforms';
import { filterCustomServers, type BuiltinServerConfig } from './customServers';
import { updateGatewayStatusBar } from './statusBar';
import type { AISiteConfig } from './types';

export interface GatewayServiceSnapshot {
    currentPort: number | null;
    currentToken: string | null;
    isStarting: boolean;
    isRunning: boolean;
}

export interface GatewayServiceController {
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    markAutoStopped(): void;
    markOffline(): void;
    getState(): GatewayServiceSnapshot;
}

interface CreateGatewayServiceControllerOptions {
    manager: GatewayManager;
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
    statusBarItem: vscode.StatusBarItem;
}

export function createGatewayServiceController(options: CreateGatewayServiceControllerOptions): GatewayServiceController {
    let currentPort: number | null = null;
    let currentToken: string | null = null;
    let isStarting = false;
    let isRunning = false;

    const getState = () => ({ currentPort, currentToken, isStarting, isRunning });

    const start = async () => {
        if (!hasWorkspaceFolder()) {
            if (isRunning || isStarting) {
                await options.manager.stop();
            }
            currentPort = null;
            currentToken = null;
            isStarting = false;
            isRunning = false;
            updateGatewayStatusBar(options.statusBarItem, false);
            void vscode.window.showErrorMessage(t('start_requires_workspace'));
            return;
        }

        // Set Loading State
        isStarting = true;
        updateGatewayStatusBar(options.statusBarItem, true, undefined, true);

        const config = vscode.workspace.getConfiguration('webcodeGateway');
        const portConfig = config.get<number>('port') ?? 34567;
        const commandShellPath = getCommandShellPath(config);
        const customServers = filterCustomServers(
            config.get<Record<string, BuiltinServerConfig>>('servers') ?? {},
            options.outputChannel
        );
        const skillDirectories = config.get<string[]>('skillDirectories') ?? [];
        const lastUsedPort = options.context.workspaceState.get<number>('mcp.lastPort');

        // [Security] Extract Allowed Origins from AI Sites config
        const aiSites = getConfiguredAiSites(config.get<AISiteConfig[]>('aiSites'));
        const allowedOrigins = buildAllowedOrigins(aiSites);

        try {
            const result = await options.manager.start({
                port: portConfig,
                preferredPort: lastUsedPort,
                mcpServers: customServers,
                allowedOrigins,
                aiSites,
                skillDirectories,
                commandShellPath
            });

            currentPort = result.port;
            currentToken = result.token;

            if (currentPort !== lastUsedPort) {
                await options.context.workspaceState.update('mcp.lastPort', currentPort);
            }

            isStarting = false;
            isRunning = true;
            updateGatewayStatusBar(options.statusBarItem, true, currentPort);
        } catch (error: unknown) {
            void vscode.window.showErrorMessage(t('start_failed', { message: getErrorMessage(error) }));
            isStarting = false;
            isRunning = false;
            updateGatewayStatusBar(options.statusBarItem, false);
        }
    };

    const stop = async () => {
        await options.manager.stop();
        isRunning = false;
        currentPort = null;
        currentToken = null;
        updateGatewayStatusBar(options.statusBarItem, false);
        void vscode.window.showInformationMessage(t('server_stopped'));
    };

    const restart = async () => {
        options.outputChannel.appendLine("🔄 Manual restart triggered.");
        await options.manager.stop();
        await start();
        void vscode.window.showInformationMessage(t('server_restarted'));
    };

    const markAutoStopped = () => {
        isRunning = false;
        updateGatewayStatusBar(options.statusBarItem, false);
        void vscode.window.showInformationMessage(t('auto_stop_message'));
        options.outputChannel.appendLine("💤 Auto-shutdown triggered due to inactivity.");
    };

    const markOffline = () => {
        isRunning = false;
        updateGatewayStatusBar(options.statusBarItem, false);
    };

    return {
        start,
        stop,
        restart,
        markAutoStopped,
        markOffline,
        getState
    };
}

function getCommandShellPath(config: vscode.WorkspaceConfiguration): string | undefined {
    const configuredCommandShellPath = config.get<string>('commandShell.path')?.trim();
    return configuredCommandShellPath === '' ? undefined : configuredCommandShellPath;
}

function hasWorkspaceFolder(): boolean {
    return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}

function buildAllowedOrigins(aiSites: AISiteConfig[]): string[] {
    return aiSites.map(site => {
        try {
            return new URL(site.address).origin;
        } catch {
            return '';
        }
    }).filter(origin => origin !== '');
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
