import * as fs from 'fs';
import * as path from 'path';

export function getVSCodeRipgrepCandidates(
    appRoot: string | undefined,
    pathValue: string | undefined,
    platform: NodeJS.Platform,
    arch: string
): string[] {
    const binaryName = getRipgrepBinaryName(platform);
    const platformArchDirectory = getRipgrepPlatformArchDirectory(platform, arch);
    return uniqueStrings(getVSCodeAppRootCandidates(appRoot, pathValue ?? '', platform).flatMap(candidateAppRoot => [
        joinPlatformPath(platform, candidateAppRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', binaryName),
        joinPlatformPath(platform, candidateAppRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', binaryName),
        joinPlatformPath(platform, candidateAppRoot, 'node_modules.asar.unpacked', 'vscode-ripgrep', 'bin', binaryName),
        joinPlatformPath(platform, candidateAppRoot, 'node_modules', 'vscode-ripgrep', 'bin', binaryName),
        joinPlatformPath(platform, candidateAppRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep-universal', 'bin', platformArchDirectory, binaryName),
        joinPlatformPath(platform, candidateAppRoot, 'node_modules', '@vscode', 'ripgrep-universal', 'bin', platformArchDirectory, binaryName)
    ]));
}

function getVSCodeAppRootCandidates(
    appRoot: string | undefined,
    pathValue: string,
    platform: NodeJS.Platform
): string[] {
    return uniqueStrings([
        ...(appRoot ? [appRoot] : []),
        ...getVSCodeAppRootCandidatesFromPath(pathValue, platform),
        ...getDefaultVSCodeAppRootCandidates(platform)
    ]).map(candidate => resolvePlatformPath(platform, candidate));
}

export function getVSCodeAppRootCandidatesFromPath(pathValue: string, platform: NodeJS.Platform): string[] {
    const commandNames = getVSCodeCommandNames(platform);
    const candidates: string[] = [];

    for (const pathEntry of splitPathValue(pathValue, platform)) {
        const normalizedPathEntry = normalizePathEntry(pathEntry, platform);
        if (looksLikeVSCodeBinDirectory(normalizedPathEntry)) {
            candidates.push(...inferVSCodeAppRootsFromBinDirectory(normalizedPathEntry, platform));
        }

        for (const commandName of commandNames) {
            const commandPath = joinPlatformPath(platform, normalizedPathEntry, commandName);
            if (!fs.existsSync(commandPath)) {
                continue;
            }

            const realCommandPath = getRealPathIfAvailable(commandPath);
            candidates.push(...inferVSCodeAppRootsFromBinDirectory(getPlatformPath(platform).dirname(realCommandPath), platform));
        }
    }

    return uniqueStrings(candidates);
}

export function getRipgrepBinaryName(platform: string): string {
    return platform === 'win32' ? 'rg.exe' : 'rg';
}

function getRipgrepPlatformArchDirectory(platform: NodeJS.Platform, arch: string): string {
    return `${platform}-${arch}`;
}

function splitPathValue(pathValue: string, platform: NodeJS.Platform): string[] {
    if (platform === 'win32') {
        return pathValue
            .split(';')
            .filter(Boolean)
            .flatMap(splitWindowsPathEntry);
    }

    return pathValue.split(path.delimiter).filter(Boolean);
}

function splitWindowsPathEntry(pathEntry: string): string[] {
    if (!pathEntry.startsWith('/')) {
        return [pathEntry];
    }

    return pathEntry.split(/:(?=\/[a-zA-Z]\/)/).filter(Boolean);
}

function normalizePathEntry(pathEntry: string, platform: NodeJS.Platform): string {
    if (platform === 'win32') {
        const msysPathMatch = pathEntry.match(/^\/([a-zA-Z])\/(.*)$/);
        if (msysPathMatch) {
            return msysPathMatch[1].toUpperCase() + ':\\' + msysPathMatch[2].replace(/\//g, '\\');
        }
    }

    return pathEntry;
}

function looksLikeVSCodeBinDirectory(binDirectory: string): boolean {
    const normalized = binDirectory.replace(/\\/g, '/').toLowerCase();
    return normalized.endsWith('/bin') &&
        /(?:visual studio code|microsoft vs code|vs code|vscode|vscodium|cursor)/.test(normalized);
}

function inferVSCodeAppRootsFromBinDirectory(binDirectory: string, platform: NodeJS.Platform): string[] {
    const parentDirectory = resolvePlatformPath(platform, binDirectory, '..');
    return [
        parentDirectory,
        joinPlatformPath(platform, parentDirectory, 'resources', 'app')
    ];
}

function getVSCodeCommandNames(platform: NodeJS.Platform): string[] {
    return platform === 'win32'
        ? ['code.cmd', 'code-insiders.cmd', 'codium.cmd', 'cursor.cmd']
        : ['code', 'code-insiders', 'codium', 'cursor'];
}

function getDefaultVSCodeAppRootCandidates(platform: NodeJS.Platform): string[] {
    if (platform === 'win32') {
        return getWindowsDefaultVSCodeAppRootCandidates();
    }
    if (platform === 'darwin') {
        return [
            '/Applications/Visual Studio Code.app/Contents/Resources/app',
            '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app',
            '/Applications/VSCodium.app/Contents/Resources/app',
            '/Applications/Cursor.app/Contents/Resources/app'
        ];
    }
    if (platform === 'linux') {
        return [
            '/usr/share/code/resources/app',
            '/usr/share/code-insiders/resources/app',
            '/usr/share/codium/resources/app',
            '/opt/visual-studio-code/resources/app',
            '/snap/code/current/usr/share/code/resources/app'
        ];
    }

    return [];
}

function getWindowsDefaultVSCodeAppRootCandidates(): string[] {
    const roots = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
        .filter((item): item is string => typeof item === 'string' && item.length > 0);

    return roots.flatMap(root => [
        path.win32.join(root, 'Programs', 'Microsoft VS Code', 'resources', 'app'),
        path.win32.join(root, 'Programs', 'Microsoft VS Code Insiders', 'resources', 'app'),
        path.win32.join(root, 'Microsoft VS Code', 'resources', 'app'),
        path.win32.join(root, 'Microsoft VS Code Insiders', 'resources', 'app'),
        path.win32.join(root, 'VSCodium', 'resources', 'app'),
        path.win32.join(root, 'Cursor', 'resources', 'app')
    ]);
}

function joinPlatformPath(platform: NodeJS.Platform, ...paths: string[]): string {
    return getPlatformPath(platform).join(...paths);
}

function resolvePlatformPath(platform: NodeJS.Platform, ...paths: string[]): string {
    return getPlatformPath(platform).resolve(...paths);
}

function getPlatformPath(platform: NodeJS.Platform): path.PlatformPath {
    return platform === 'win32' ? path.win32 : path.posix;
}

function getRealPathIfAvailable(filePath: string): string {
    try {
        return fs.realpathSync(filePath);
    } catch {
        return filePath;
    }
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values));
}
