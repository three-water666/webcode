import { BRANDING } from '@webcode/shared';
import * as vscode from 'vscode';

import { t } from '../i18n';

export function updateGatewayStatusBar(
    statusBarItem: vscode.StatusBarItem,
    online: boolean,
    port?: number,
    isLoading: boolean = false
): void {
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
