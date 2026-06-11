import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';

import type { BrowserFamily } from './isolatedBrowserProfiles';

export async function isBrowserProcessRunning(browserFamily: BrowserFamily): Promise<boolean> {
    const platform = os.platform();

    if (platform === 'win32') {
        const imageName = browserFamily === 'edge' ? 'msedge.exe' : 'chrome.exe';
        const output = await execFileText('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH']);
        return output.toLowerCase().includes(`"${imageName.toLowerCase()}"`);
    }

    const processNames = getBrowserProcessNames(browserFamily, platform);
    const results = await Promise.all(processNames.map(name => isProcessNameRunning(name)));
    return results.some(Boolean);
}

export async function isBrowserProfileInUse(browserFamily: BrowserFamily, profileDir: string): Promise<boolean> {
    const platform = os.platform();
    try {
        const commandLines = await listBrowserProcessCommandLines(browserFamily, platform);
        const normalizedProfileDir = normalizeProcessPath(profileDir, platform);
        return commandLines.some(commandLine => commandLineContainsProfile(commandLine, normalizedProfileDir, platform));
    } catch {
        return isBrowserProcessRunning(browserFamily);
    }
}

function getBrowserProcessNames(browserFamily: BrowserFamily, platform: NodeJS.Platform): string[] {
    if (platform === 'darwin') {
        return browserFamily === 'edge' ? ['Microsoft Edge'] : ['Google Chrome', 'Google Chrome Helper'];
    }

    return browserFamily === 'edge'
        ? ['msedge', 'microsoft-edge', 'microsoft-edge-stable']
        : ['chrome', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
}

async function isProcessNameRunning(processName: string): Promise<boolean> {
    try {
        await execFileText('pgrep', ['-x', processName]);
        return true;
    } catch {
        return isProcessNameRunningWithPs(processName);
    }
}

async function isProcessNameRunningWithPs(processName: string): Promise<boolean> {
    try {
        const output = await execFileText('ps', ['-A', '-o', 'comm=']);
        return output
            .split(/\r?\n/)
            .map(command => path.basename(command.trim()))
            .some(command => command === processName);
    } catch {
        return false;
    }
}

async function listBrowserProcessCommandLines(
    browserFamily: BrowserFamily,
    platform: NodeJS.Platform
): Promise<string[]> {
    if (platform === 'win32') {
        return listWindowsBrowserProcessCommandLines(browserFamily);
    }

    return listPosixBrowserProcessCommandLines(browserFamily, platform);
}

async function listWindowsBrowserProcessCommandLines(browserFamily: BrowserFamily): Promise<string[]> {
    const imageName = browserFamily === 'edge' ? 'msedge.exe' : 'chrome.exe';
    const command = [
        '$ErrorActionPreference = "Stop";',
        `Get-CimInstance Win32_Process -Filter "Name='${imageName}'" |`,
        'ForEach-Object { $_.CommandLine }'
    ].join(' ');
    const output = await execFileText('powershell.exe', ['-NoProfile', '-Command', command]);
    return output.split(/\r?\n/).filter(line => line.trim().length > 0);
}

async function listPosixBrowserProcessCommandLines(
    browserFamily: BrowserFamily,
    platform: NodeJS.Platform
): Promise<string[]> {
    const output = await execFileText('ps', [platform === 'darwin' ? '-axo' : '-eo', 'args=']);
    const processNames = getBrowserProcessNames(browserFamily, platform).map(name => name.toLowerCase());
    return output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => processNames.some(name => line.toLowerCase().includes(name)));
}

function commandLineContainsProfile(
    commandLine: string,
    normalizedProfileDir: string,
    platform: NodeJS.Platform
): boolean {
    const normalizedCommandLine = normalizeCommandLine(commandLine, platform);
    return normalizedCommandLine.includes('--user-data-dir') &&
        normalizedCommandLine.includes(normalizedProfileDir);
}

function normalizeCommandLine(commandLine: string, platform: NodeJS.Platform): string {
    const normalized = commandLine.replace(/\\/g, '/');
    return isCaseInsensitivePlatform(platform) ? normalized.toLowerCase() : normalized;
}

function normalizeProcessPath(filePath: string, platform: NodeJS.Platform): string {
    const normalized = path.resolve(filePath).replace(/\\/g, '/').replace(/\/+$/g, '');
    return isCaseInsensitivePlatform(platform) ? normalized.toLowerCase() : normalized;
}

function isCaseInsensitivePlatform(platform: NodeJS.Platform): boolean {
    return platform === 'win32' || platform === 'darwin';
}

function execFileText(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(command, args, (error, stdout) => {
            if (error) {
                reject(new Error(error.message));
                return;
            }

            resolve(stdout);
        });
    });
}
