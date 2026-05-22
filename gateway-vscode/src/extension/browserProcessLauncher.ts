import { spawn } from 'child_process';
import * as vscode from 'vscode';

import { t } from '../i18n';

export interface BrowserLaunchCommand {
    command: string;
    prefixArgs: string[];
}

const BROWSER_STABLE_LAUNCH_MS = 1000;

export function launchFirstAvailableBrowser(
    launchCommands: BrowserLaunchCommand[],
    browserArgs: string[],
    browserName: string
): void {
    const tryLaunch = (index: number, lastFailure?: string) => {
        const launchCommand = launchCommands[index];
        if (!launchCommand) {
            showLaunchFailure(browserName, lastFailure);
            return;
        }

        launchBrowserCandidate(launchCommand, browserArgs, browserName, failure => {
            tryLaunch(index + 1, failure ?? lastFailure);
        });
    };

    tryLaunch(0);
}

function launchBrowserCandidate(
    launchCommand: BrowserLaunchCommand,
    browserArgs: string[],
    browserName: string,
    onFailure: (failure?: string) => void
): void {
    let settled = false;
    let stableTimer: NodeJS.Timeout | undefined;
    const child = spawn(launchCommand.command, [...launchCommand.prefixArgs, ...browserArgs], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
    });

    const continueWithFailure = (failure: string | undefined) => {
        if (settled) {
            return;
        }

        settled = true;
        if (stableTimer) {
            clearTimeout(stableTimer);
        }

        onFailure(failure);
    };

    child.once('error', (error: NodeJS.ErrnoException) => {
        continueWithFailure(error.code === 'ENOENT' ? undefined : error.message);
    });

    child.once('spawn', () => {
        stableTimer = setTimeout(() => {
            settled = true;
            child.unref();
        }, BROWSER_STABLE_LAUNCH_MS);
    });

    child.once('close', (code, signal) => {
        if (settled) {
            return;
        }

        if (code === 0) {
            settled = true;
            if (stableTimer) {
                clearTimeout(stableTimer);
            }
            return;
        }

        continueWithFailure(t('browser_exited_immediately', {
            browser: browserName,
            command: launchCommand.command,
            reason: formatBrowserExitReason(code, signal)
        }));
    });
}

function showLaunchFailure(browserName: string, lastFailure?: string): void {
    if (lastFailure) {
        void vscode.window.showErrorMessage(t('open_browser_failed', { message: lastFailure }));
        return;
    }

    void vscode.window.showErrorMessage(t('browser_not_found', { browser: browserName }));
}

function formatBrowserExitReason(code: number | null, signal: NodeJS.Signals | null): string {
    if (code !== null) {
        return `exit code ${code}`;
    }

    return signal ? `signal ${signal}` : 'unknown reason';
}
