import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';

type BrowserFamily = 'chrome' | 'edge';

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
