import { exec } from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';

import { t } from '../i18n';
import { getConfiguredAiSites } from '../platforms';
import type { AISiteConfig } from './types';

interface LaunchBridgeOptions {
    targetUrl: string;
    browserMode: string;
    currentPort: number;
    currentToken: string;
}

export function launchBridge(options: LaunchBridgeOptions): void {
    const bridgeUrl = buildBridgeUrl(options.currentPort, options.currentToken, options.targetUrl);
    const finalBrowser = resolveBrowser(options.targetUrl, options.browserMode);

    openBrowser(bridgeUrl, finalBrowser);
}

function buildBridgeUrl(currentPort: number, currentToken: string, targetUrl: string): string {
    return `http://127.0.0.1:${currentPort}/bridge?token=${currentToken}&target=${encodeURIComponent(targetUrl)}`;
}

function resolveBrowser(targetUrl: string, browserMode: string): string {
    const config = vscode.workspace.getConfiguration('webcodeGateway');

    if (browserMode !== 'auto') {
        return browserMode;
    }

    // 新逻辑：优先检查 aiSites 中是否有配置 browser
    const aiSites = getConfiguredAiSites(config.get<AISiteConfig[]>('aiSites'));
    const matchedSite = aiSites.find(site => site.address === targetUrl);

    if (matchedSite?.browser && matchedSite.browser !== 'default') {
        return matchedSite.browser;
    }

    // 如果没有特定配置，使用全局默认设置
    return config.get<string>('browser') ?? 'default';
}

function openBrowser(url: string, browserType: string): void {
    if (browserType === 'default') {
        void vscode.env.openExternal(vscode.Uri.parse(url));
        return;
    }

    const command = buildBrowserCommand(url, browserType, os.platform());

    if (command) {
        exec(command, (err) => {
            if (err) {
                void vscode.window.showErrorMessage(t('open_browser_failed', { message: err.message }));
            }
        });
        return;
    }

    void vscode.env.openExternal(vscode.Uri.parse(url));
}

function buildBrowserCommand(url: string, browserType: string, platform: NodeJS.Platform): string {
    if (platform === 'win32') {
        return buildWindowsBrowserCommand(url, browserType);
    }

    if (platform === 'darwin') {
        return buildMacBrowserCommand(url, browserType);
    }

    return buildLinuxBrowserCommand(url, browserType);
}

function buildWindowsBrowserCommand(url: string, browserType: string): string {
    if (browserType === 'chrome') {
        return `start chrome "${url}"`;
    }

    if (browserType === 'edge') {
        return `start msedge "${url}"`;
    }

    return '';
}

function buildMacBrowserCommand(url: string, browserType: string): string {
    if (browserType === 'chrome') {
        return `open -a "Google Chrome" "${url}"`;
    }

    if (browserType === 'edge') {
        return `open -a "Microsoft Edge" "${url}"`;
    }

    return '';
}

function buildLinuxBrowserCommand(url: string, browserType: string): string {
    if (browserType === 'chrome') {
        return `google-chrome "${url}"`;
    }

    return `xdg-open "${url}"`;
}
