import type * as vscode from 'vscode';

export type { AISiteConfig, ResolvedAiSiteConfig } from '../platforms';

// target 用于快速启动，action 用于特殊操作 (showLogs, settings, custom)
export interface CustomActionItem extends vscode.QuickPickItem {
    siteId?: string;
    target?: string;
    action?: string;
    value?: string;
    profileCleanupTarget?: 'current' | 'legacy';
}
