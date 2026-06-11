import * as vscode from 'vscode';

import { t } from '../i18n';
import {
    ensureCurrentIsolatedBrowserProfile,
    resolveIsolatedBrowserProfilePaths,
    type BrowserFamily
} from './isolatedBrowserProfiles';
import { getErrorMessage } from './errorUtils';

export async function prepareIsolatedProfileDirForLaunch(
    browserFamily: BrowserFamily,
    context: vscode.ExtensionContext
): Promise<string | null> {
    const profilePathsResult = resolveIsolatedBrowserProfilePaths({
        browserFamily,
        legacyStorageRoot: context.globalStorageUri.fsPath,
        configuredProfileRoot: getConfiguredProfileRoot()
    });
    if (profilePathsResult.status === 'invalid-profile-root') {
        void vscode.window.showErrorMessage(t('isolated_profile_root_invalid', {
            path: profilePathsResult.configuredProfileRoot
        }));
        return null;
    }

    try {
        return await ensureCurrentIsolatedBrowserProfile(profilePathsResult.paths);
    } catch (error: unknown) {
        void vscode.window.showErrorMessage(t('isolated_profile_prepare_failed', {
            path: profilePathsResult.paths.profileDir,
            message: getErrorMessage(error)
        }));
        return null;
    }
}

function getConfiguredProfileRoot(): string | undefined {
    return vscode.workspace
        .getConfiguration('webcodeGateway')
        .get<string>('isolatedBrowser.profileRoot');
}
