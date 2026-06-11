import * as fs from 'fs/promises';
import * as vscode from 'vscode';

import { t } from '../i18n';
import {
    BROWSER_FAMILIES,
    clearIsolatedBrowserProfiles,
    hasCurrentIsolatedBrowserProfiles,
    hasLegacyIsolatedBrowserProfiles,
    resolveIsolatedBrowserProfilePaths,
    type ClearIsolatedBrowserProfilesFailure,
    type IsolatedBrowserProfilePaths
} from './isolatedBrowserProfiles';
import { getErrorMessage } from './errorUtils';
import { isBrowserProfileInUse } from './processDetection';

export const RESET_ISOLATED_BROWSER_PROFILES_COMMAND = 'webcode-gateway.resetIsolatedBrowserProfiles';
export const CLEAN_LEGACY_ISOLATED_BROWSER_PROFILES_COMMAND = 'webcode-gateway.cleanLegacyIsolatedBrowserProfiles';

type CleanupTarget = 'current' | 'legacy';

export function registerIsolatedProfileCleanupCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(RESET_ISOLATED_BROWSER_PROFILES_COMMAND, async () => {
            await handleClearIsolatedBrowserProfiles(context, 'current');
        }),
        vscode.commands.registerCommand(CLEAN_LEGACY_ISOLATED_BROWSER_PROFILES_COMMAND, async () => {
            await handleClearIsolatedBrowserProfiles(context, 'legacy');
        })
    );
}

export async function hasLegacyIsolatedBrowserProfileData(context: vscode.ExtensionContext): Promise<boolean> {
    return hasIsolatedBrowserProfileData(context, 'legacy');
}

export async function hasCurrentIsolatedBrowserProfileData(context: vscode.ExtensionContext): Promise<boolean> {
    return hasIsolatedBrowserProfileData(context, 'current');
}

async function hasIsolatedBrowserProfileData(context: vscode.ExtensionContext, target: CleanupTarget): Promise<boolean> {
    const pathsResult = resolveCleanupProfilePaths(context);
    if (pathsResult.status !== 'ready') {
        return false;
    }

    try {
        return target === 'current'
            ? hasCurrentIsolatedBrowserProfiles(pathsResult.pathsByFamily)
            : hasLegacyIsolatedBrowserProfiles(pathsResult.pathsByFamily);
    } catch {
        return false;
    }
}

async function handleClearIsolatedBrowserProfiles(
    context: vscode.ExtensionContext,
    target: CleanupTarget
): Promise<void> {
    const pathsResult = resolveCleanupProfilePaths(context);
    if (pathsResult.status === 'invalid-profile-root') {
        void vscode.window.showErrorMessage(t('isolated_profile_root_invalid', { path: pathsResult.configuredProfileRoot }));
        return;
    }

    if (!await hasProfileData(pathsResult.pathsByFamily, target)) {
        await showNoProfilesFound(pathsResult.pathsByFamily, target);
        return;
    }

    const confirmed = await confirmClear(pathsResult.pathsByFamily, target);
    if (!confirmed) {
        return;
    }

    await clearProfilesWithProgress(pathsResult.pathsByFamily, target);
}

async function clearProfilesWithProgress(
    pathsByFamily: IsolatedBrowserProfilePaths[],
    target: CleanupTarget
): Promise<void> {
    const result = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: t(target === 'current' ? 'isolated_profiles_reset_progress' : 'isolated_profiles_clean_legacy_progress')
        },
        () => clearIsolatedBrowserProfiles({
            pathsByFamily,
            target,
            isProfileInUse: isBrowserProfileInUse
        })
    );

    if (result.status === 'cleared') {
        void vscode.window.showInformationMessage(
            t(target === 'current' ? 'isolated_profiles_reset_done' : 'isolated_profiles_clean_legacy_done')
        );
        return;
    }

    await showClearFailure(pathsByFamily, target, result);
}

async function showClearFailure(
    pathsByFamily: IsolatedBrowserProfilePaths[],
    target: CleanupTarget,
    result: ClearIsolatedBrowserProfilesFailure
): Promise<void> {
    const openFolderLabel = t('isolated_profiles_open_folder_button');
    const message = result.status === 'blocked-in-use'
        ? t('isolated_profiles_reset_in_use', {
            browser: getBrowserDisplayName(result.browserFamily),
            path: result.profileDir
        })
        : t('isolated_profiles_reset_failed', { message: result.message });
    const selection = await vscode.window.showWarningMessage(message, openFolderLabel);
    if (selection === openFolderLabel) {
        await openProfileLocation(pathsByFamily, target);
    }
}

type ResolveCleanupProfilePathsResult =
    | { status: 'ready'; pathsByFamily: IsolatedBrowserProfilePaths[] }
    | { status: 'invalid-profile-root'; configuredProfileRoot: string };

function resolveCleanupProfilePaths(context: vscode.ExtensionContext): ResolveCleanupProfilePathsResult {
    const configuredProfileRoot = vscode.workspace
        .getConfiguration('webcodeGateway')
        .get<string>('isolatedBrowser.profileRoot');
    const pathsByFamily: IsolatedBrowserProfilePaths[] = [];

    for (const browserFamily of BROWSER_FAMILIES) {
        const result = resolveIsolatedBrowserProfilePaths({
            browserFamily,
            legacyStorageRoot: context.globalStorageUri.fsPath,
            configuredProfileRoot
        });
        if (result.status === 'invalid-profile-root') {
            return result;
        }

        pathsByFamily.push(result.paths);
    }

    return { status: 'ready', pathsByFamily };
}

async function confirmClear(
    pathsByFamily: IsolatedBrowserProfilePaths[],
    target: CleanupTarget
): Promise<boolean> {
    const deleteLabel = t(target === 'current'
        ? 'isolated_profiles_reset_confirm_button'
        : 'isolated_profiles_clean_legacy_confirm_button');
    const openFolderLabel = t('isolated_profiles_open_folder_button');
    const selection = await vscode.window.showWarningMessage(
        buildConfirmMessage(pathsByFamily, target),
        { modal: true },
        deleteLabel,
        openFolderLabel
    );

    if (selection === openFolderLabel) {
        await openProfileLocation(pathsByFamily, target);
        return false;
    }

    return selection === deleteLabel;
}

async function hasProfileData(pathsByFamily: IsolatedBrowserProfilePaths[], target: CleanupTarget): Promise<boolean> {
    return target === 'current'
        ? hasCurrentIsolatedBrowserProfiles(pathsByFamily)
        : hasLegacyIsolatedBrowserProfiles(pathsByFamily);
}

async function showNoProfilesFound(
    pathsByFamily: IsolatedBrowserProfilePaths[],
    target: CleanupTarget
): Promise<void> {
    const openFolderLabel = t('isolated_profiles_open_folder_button');
    const selection = await vscode.window.showInformationMessage(
        t(target === 'current' ? 'isolated_profiles_reset_none_found' : 'isolated_profiles_clean_legacy_none_found'),
        openFolderLabel
    );
    if (selection === openFolderLabel) {
        await openProfileLocation(pathsByFamily, target);
    }
}

function buildConfirmMessage(pathsByFamily: IsolatedBrowserProfilePaths[], target: CleanupTarget): string {
    const paths = getProfileRoots(pathsByFamily, target).join('\n');
    return t(target === 'current' ? 'isolated_profiles_reset_confirm' : 'isolated_profiles_clean_legacy_confirm', {
        paths
    });
}

async function openProfileLocation(
    pathsByFamily: IsolatedBrowserProfilePaths[],
    target: CleanupTarget
): Promise<void> {
    const folderPath = getProfileRoots(pathsByFamily, target)[0];
    if (!folderPath) {
        return;
    }

    try {
        if (target === 'current') {
            await fs.mkdir(folderPath, { recursive: true });
        }

        await vscode.env.openExternal(vscode.Uri.file(folderPath));
    } catch (error: unknown) {
        void vscode.window.showErrorMessage(t('isolated_profiles_open_folder_failed', {
            path: folderPath,
            message: getErrorMessage(error)
        }));
    }
}

function getProfileRoots(pathsByFamily: IsolatedBrowserProfilePaths[], target: CleanupTarget): string[] {
    return [...new Set(pathsByFamily.map(paths => target === 'current' ? paths.profileRoot : paths.legacyProfileRoot))];
}

function getBrowserDisplayName(browserFamily: IsolatedBrowserProfilePaths['browserFamily']): string {
    return browserFamily === 'edge' ? 'Microsoft Edge' : 'Chrome for Testing / Chromium';
}
