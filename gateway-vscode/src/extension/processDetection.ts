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
        return commandLines.some(commandLine => browserCommandLineUsesProfile(commandLine, profileDir, platform));
    } catch {
        return isBrowserProcessRunning(browserFamily);
    }
}

export function browserCommandLineUsesProfile(
    commandLine: string,
    profileDir: string,
    platform: NodeJS.Platform = os.platform()
): boolean {
    const profileArg = readUserDataDirArgument(commandLine);
    if (!profileArg) {
        return false;
    }

    return normalizeProcessPath(profileArg, platform) === normalizeProcessPath(profileDir, platform);
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

function readUserDataDirArgument(commandLine: string): string | null {
    const tokens = tokenizeCommandLine(commandLine);
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === '--user-data-dir') {
            return tokens[index + 1] ?? null;
        }

        if (token.startsWith('--user-data-dir=')) {
            return token.slice('--user-data-dir='.length);
        }
    }

    return null;
}

function tokenizeCommandLine(commandLine: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    for (const char of commandLine) {
        if (quote) {
            if (char === quote) {
                quote = null;
            } else {
                current += char;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            quote = char;
        } else if (/\s/.test(char)) {
            pushToken(tokens, current);
            current = '';
        } else {
            current += char;
        }
    }

    pushToken(tokens, current);
    return tokens;
}

function pushToken(tokens: string[], token: string): void {
    if (token) {
        tokens.push(token);
    }
}

function normalizeProcessPath(filePath: string, platform: NodeJS.Platform): string {
    const platformPath = platform === 'win32' ? path.win32 : path.posix;
    const normalized = platformPath.resolve(filePath).replace(/\\/g, '/').replace(/\/+$/g, '');
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
