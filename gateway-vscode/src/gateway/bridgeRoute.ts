import * as crypto from 'crypto';
import type express from 'express';
import { BRANDING } from '@webcode/shared';

import { getDefaultBridgeTarget } from '../platforms';
import type { GatewayLogger } from './types';

type BridgeRouteOptions = {
    getPort: () => number;
    getAllowedOrigins: () => readonly string[];
    getWorkspaceRoot: () => string | null;
    log: GatewayLogger;
};

function createWorkspaceId(workspaceRoot: string | null): string {
    if (!workspaceRoot) {
        return 'global';
    }

    return crypto.createHash('md5').update(workspaceRoot).digest('hex').substring(0, 16);
}

export function registerBridgeRoute(app: express.Express, options: BridgeRouteOptions): void {
    app.get('/bridge', (req, res) => {
        const rawTarget = getSingleQueryValue(req.query.target) ?? getDefaultBridgeTarget();
        const target = resolveAllowedBridgeTarget(rawTarget, options.getAllowedOrigins());
        if (!target) {
            options.log(`⛔ Rejected bridge target: ${rawTarget}`);
            res.status(400).send(renderInvalidBridgePage());
            return;
        }

        const port = options.getPort();
        const releaseUrl = `${BRANDING.repositoryUrl}/releases`;
        const workspaceId = createWorkspaceId(options.getWorkspaceRoot());

        options.log(`🌉 Bridge handshake requested for workspace [${workspaceId}].`);

        res.send(renderBridgePage({ port, workspaceId, releaseUrl }));
    });
}

type BridgePageOptions = {
    port: number;
    workspaceId: string;
    releaseUrl: string;
};

function renderBridgePage({
    port,
    workspaceId,
    releaseUrl
}: BridgePageOptions): string {
    return `
                <!DOCTYPE html>
                <html>
                ${renderBridgeHead()}
                <body>
                    ${renderMainCard()}

                    ${renderBridgeData({ port, workspaceId })}

                    ${renderInstallGuide(releaseUrl)}

                    ${renderBridgeScript(releaseUrl)}
                </body>
                </html>
            `;
}

export function resolveAllowedBridgeTarget(rawTarget: string, allowedOrigins: readonly string[]): string | null {
    let parsedTarget: URL;
    try {
        parsedTarget = new URL(rawTarget);
    } catch {
        return null;
    }

    if (parsedTarget.protocol !== 'https:' && parsedTarget.protocol !== 'http:') {
        return null;
    }

    const allowedOriginSet = new Set(allowedOrigins);
    if (!allowedOriginSet.has(parsedTarget.origin)) {
        return null;
    }

    return parsedTarget.href;
}

function getSingleQueryValue(value: unknown): string | null {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
    }

    return null;
}

function renderBridgeData(options: Pick<BridgePageOptions, 'port' | 'workspaceId'>): string {
    return `<script id="mcp-data" type="application/json">${escapeHtmlText(JSON.stringify(options))}</script>`;
}

function renderBridgeHead(): string {
    return `<head>
                    <title>${BRANDING.bridgeName}</title>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #1e1e1e; color: #fff; text-align: center; }
                        .loader { border: 3px solid #333; border-top: 3px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
                        .card { background: #252526; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); max-width: 400px; }
                        h2 { margin-top: 0; color: #3498db; }
                        p { color: #cccccc; }
                        .warn { color: #e67e22; font-size: 0.9em; margin-top: 10px; }
                        button { background: #3498db; border: none; padding: 10px 20px; color: white; border-radius: 4px; cursor: pointer; margin-top: 15px; }
                        button:hover { background: #2980b9; }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    </style>
                </head>`;
}

function renderMainCard(): string {
    return `<div class="card" id="main-card">
                        <div class="loader" id="loader"></div>
                        <h2 id="bridge-title">Connecting to ${BRANDING.productName}...</h2>
                        <p id="bridge-status">Synchronizing with VS Code...</p>
                    </div>`;
}

function renderInstallGuide(releaseUrl: string): string {
    return `<div class="card" id="install-guide" style="display:none; border: 1px solid #e74c3c; box-shadow: 0 4px 15px rgba(231, 76, 60, 0.2);">
                        <h2 id="install-title" style="color:#e74c3c; margin-bottom:10px">⚠️ Extension Required</h2>
                        <p id="install-desc" style="margin-bottom:20px">To enable auto-connection, you need the companion browser extension:</p>
                        <div style="background:#333; padding:10px; border-radius:6px; margin-bottom:20px; font-weight:bold; color:#fff">
                            🧩 ${BRANDING.bridgeName}
                        </div>
                        <a id="install-button" href="${escapeHtmlAttr(releaseUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; background:#e74c3c; color:white; padding:10px 20px; text-decoration:none; border-radius:4px; font-weight:bold;">
                            Get Browser Extension
                        </a>
                        <p id="install-warn" class="warn" style="margin-top:15px; font-size:12px">Already installed? Try reloading this page.</p>
                    </div>`;
}

function renderBridgeScript(releaseUrl: string): string {
    return `<script>
                        const productName = ${toSafeScriptJson(BRANDING.productName)};
                        const releaseUrl = ${toSafeScriptJson(releaseUrl)};
                        const isZh = navigator.language.toLowerCase().startsWith('zh');
                        const bridgeI18n = isZh ? {
                            connectingTitle: '正在连接 ' + productName + '...',
                            connectingStatus: '正在与 VS Code 同步...',
                            installTitle: '需要浏览器扩展',
                            installDesc: '要启用自动连接，您需要先安装配套的浏览器扩展：',
                            installButton: '前往下载浏览器扩展',
                            installWarn: '如果已经安装，请尝试刷新当前页面。',
                            installAlert: '请前往 GitHub Releases 下载浏览器插件：' + releaseUrl
                        } : {
                            connectingTitle: 'Connecting to ' + productName + '...',
                            connectingStatus: 'Synchronizing with VS Code...',
                            installTitle: 'Browser Extension Required',
                            installDesc: 'To enable auto-connection, you need the companion browser extension:',
                            installButton: 'Download Browser Extension',
                            installWarn: 'Already installed? Try reloading this page.',
                            installAlert: 'Please download the browser extension from GitHub Releases: ' + releaseUrl
                        };
                        window.__bridgeI18n = bridgeI18n;
                        document.getElementById('bridge-title').textContent = bridgeI18n.connectingTitle;
                        document.getElementById('bridge-status').textContent = bridgeI18n.connectingStatus;
                        document.getElementById('install-title').textContent = bridgeI18n.installTitle;
                        document.getElementById('install-desc').textContent = bridgeI18n.installDesc;
                        document.getElementById('install-button').textContent = bridgeI18n.installButton;
                        document.getElementById('install-button').addEventListener('click', () => alert(bridgeI18n.installAlert));
                        document.getElementById('install-warn').textContent = bridgeI18n.installWarn;

                        // 检测逻辑：等待 1.5 秒
                        setTimeout(() => {
                            // 1. 检查插件是否打上了标记
                            const isInstalled = document.documentElement.getAttribute('data-extension-installed') === 'true';

                            // 2. 双重保险：检查页面内容是否已经被插件修改（例如出现了冲突提示）
                            const bridgeState = document.body.dataset.bridgeState;
                            const isBusyOrConflict = bridgeState === 'conflict' || bridgeState === 'switching' || bridgeState === 'connected';

                            // 只有在既没安装，也没发生冲突的情况下，才显示安装引导
                            if (!isInstalled && !isBusyOrConflict) {
                                document.getElementById('main-card').style.display = 'none';
                                document.getElementById('install-guide').style.display = 'block';
                            }
                        }, 1500);
                    </script>`;
}

function renderInvalidBridgePage(): string {
    return `<!DOCTYPE html>
                <html>
                ${renderBridgeHead()}
                <body>
                    <div class="card" id="main-card">
                        <h2 id="bridge-title">Invalid bridge target</h2>
                        <p id="bridge-status">This bridge link does not match a configured AI site.</p>
                    </div>
                </body>
                </html>`;
}

function escapeHtmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function toSafeScriptJson(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
