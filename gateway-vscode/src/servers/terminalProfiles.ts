import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type TerminalShellKind = 'posix' | 'powershell';
type TerminalProfileSource = 'default' | 'user' | 'configured' | 'detected';

export interface WebcodeTerminalProfile {
    id: string;
    label: string;
    shellKind: TerminalShellKind;
    syntax: string;
    source: TerminalProfileSource;
    shellPath?: string;
    shellArgs?: string[] | string;
    resolvedPath?: string;
    vscodeProfileName?: string;
    useVSCodeDefault?: boolean;
}

interface TerminalProfileDiscoveryOptions {
    configuredCommandShellPath?: string;
    env?: NodeJS.ProcessEnv;
    exists?: (candidate: string) => boolean;
    platform?: NodeJS.Platform;
}

interface ConfiguredTerminalProfile {
    id: string;
    name: string;
    shellKind: TerminalShellKind;
    shellPath: string;
    shellArgs?: string[] | string;
}

const WINDOWS_PROFILE_IDS = ['git-bash', 'pwsh', 'powershell'];
const POSIX_PROFILE_IDS = ['zsh', 'bash', 'sh'];

export function listTerminalProfiles(options: TerminalProfileDiscoveryOptions = {}): WebcodeTerminalProfile[] {
    const platform = options.platform ?? process.platform;
    const env = options.env ?? process.env;
    const exists = options.exists ?? fs.existsSync;
    const configuredProfiles = readConfiguredTerminalProfiles(platform, exists);
    const profiles: WebcodeTerminalProfile[] = [];
    const defaultProfile = createDefaultProfile(platform, configuredProfiles);

    addProfile(profiles, defaultProfile, platform);
    for (const id of profileIdsForPlatform(platform)) {
        addProfile(profiles, createNamedProfile(id, configuredProfiles, { ...options, env, exists, platform }), platform);
    }

    return profiles;
}

export function resolveTerminalProfile(
    requestedProfile: unknown,
    options: TerminalProfileDiscoveryOptions = {}
): WebcodeTerminalProfile {
    const profiles = listTerminalProfiles(options);
    const requested = typeof requestedProfile === 'string' && requestedProfile.trim() ? requestedProfile.trim() : '';
    const selected = profiles.find(profile => profile.id === requested)
        ?? (!requested ? profiles[0] : undefined);

    if (selected) {
        return selected;
    }

    const available = profiles.map(profile => profile.id).join(', ') || 'none';
    throw new Error(`Unsupported terminal profile '${requested}'. Available profiles: ${available}.`);
}

export function describeTerminalProfiles(profiles: WebcodeTerminalProfile[]): string {
    if (profiles.length === 0) {
        return 'No supported VS Code terminal profiles were detected. Configure Git Bash, pwsh, or PowerShell.';
    }

    return profiles.map(profile => {
        const pathText = profile.resolvedPath ? ` Path: ${profile.resolvedPath}.` : '';
        return `- ${profile.id}: ${profile.label}. Syntax: ${profile.syntax}.${pathText}`;
    }).join('\n');
}

function createDefaultProfile(
    platform: NodeJS.Platform,
    configuredProfiles: ConfiguredTerminalProfile[]
): WebcodeTerminalProfile | null {
    const defaultName = readDefaultProfileName(platform);
    const configured = defaultName
        ? configuredProfiles.find(profile => sameProfileName(profile.name, defaultName))
        : null;
    const resolvedPath = configured?.shellPath ?? vscode.env.shell;
    const shellKind = configured?.shellKind ?? inferShellKind(resolvedPath, defaultName ?? 'default');

    if (!shellKind) {
        return null;
    }

    const detail = defaultName ?? describeShellPath(resolvedPath);
    return {
        id: 'default',
        label: `VS Code default terminal (${detail})`,
        shellKind,
        syntax: syntaxForShellKind(shellKind),
        source: 'default',
        resolvedPath,
        useVSCodeDefault: true,
        vscodeProfileName: defaultName
    };
}

function createNamedProfile(
    id: string,
    configuredProfiles: ConfiguredTerminalProfile[],
    options: Required<Pick<TerminalProfileDiscoveryOptions, 'env' | 'exists' | 'platform'>>
        & Pick<TerminalProfileDiscoveryOptions, 'configuredCommandShellPath'>
): WebcodeTerminalProfile | null {
    const configured = configuredProfiles.find(profile => profile.id === id);
    if (configured) {
        return profileFromConfigured(configured);
    }

    return detectProfile(id, options);
}

function profileFromConfigured(profile: ConfiguredTerminalProfile): WebcodeTerminalProfile {
    return {
        id: profile.id,
        label: profile.name,
        shellKind: profile.shellKind,
        syntax: syntaxForShellKind(profile.shellKind),
        source: 'user',
        shellPath: profile.shellPath,
        shellArgs: profile.shellArgs,
        resolvedPath: profile.shellPath,
        vscodeProfileName: profile.name
    };
}

function detectProfile(
    id: string,
    options: Required<Pick<TerminalProfileDiscoveryOptions, 'env' | 'exists' | 'platform'>>
        & Pick<TerminalProfileDiscoveryOptions, 'configuredCommandShellPath'>
): WebcodeTerminalProfile | null {
    if (id === 'git-bash') {
        const configuredGitBash = detectConfiguredGitBash(options);
        return detectedProfile(
            id,
            configuredGitBash ?? detectGitBash(options),
            'Git Bash',
            'posix',
            configuredGitBash ? 'configured' : 'detected'
        );
    }

    if (id === 'pwsh') {
        return detectedProfile(id, detectPwsh(options), 'PowerShell 7', 'powershell', 'detected');
    }

    if (id === 'powershell') {
        return detectedProfile(id, detectWindowsPowerShell(options), 'Windows PowerShell', 'powershell', 'detected');
    }

    return detectedProfile(id, detectPosixShell(id, options), id, 'posix', 'detected');
}

function detectedProfile(
    id: string,
    shellPath: string | null,
    label: string,
    shellKind: TerminalShellKind,
    source: TerminalProfileSource
): WebcodeTerminalProfile | null {
    if (!shellPath) {
        return null;
    }

    return {
        id,
        label,
        shellKind,
        syntax: syntaxForShellKind(shellKind),
        source,
        shellPath,
        resolvedPath: shellPath
    };
}

function readConfiguredTerminalProfiles(
    platform: NodeJS.Platform,
    exists: (candidate: string) => boolean
): ConfiguredTerminalProfile[] {
    const rawProfiles = vscode.workspace
        .getConfiguration('terminal.integrated')
        .get<unknown>(`profiles.${configPlatformKey(platform)}`);

    if (!isRecord(rawProfiles)) {
        return [];
    }

    return Object.entries(rawProfiles)
        .map(([name, value]) => parseConfiguredProfile(name, value, platform, exists))
        .filter((profile): profile is ConfiguredTerminalProfile => profile !== null);
}

function parseConfiguredProfile(
    name: string,
    value: unknown,
    platform: NodeJS.Platform,
    exists: (candidate: string) => boolean
): ConfiguredTerminalProfile | null {
    if (!isRecord(value)) {
        return null;
    }

    const shellPath = selectShellPath(value.path, exists);
    if (!shellPath) {
        return null;
    }

    const shellKind = inferShellKind(shellPath, name);
    const id = inferProfileId(shellPath, name, shellKind, platform);
    if (!shellKind || !id) {
        return null;
    }

    return {
        id,
        name,
        shellKind,
        shellPath,
        shellArgs: selectShellArgs(value.args)
    };
}

function readDefaultProfileName(platform: NodeJS.Platform): string | undefined {
    const value = vscode.workspace
        .getConfiguration('terminal.integrated')
        .get<unknown>(`defaultProfile.${configPlatformKey(platform)}`);

    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function detectConfiguredGitBash(options: Required<Pick<TerminalProfileDiscoveryOptions, 'exists'>> & {
    configuredCommandShellPath?: string;
}): string | null {
    const configured = options.configuredCommandShellPath?.trim();
    const isGitBash = configured
        && inferProfileId(configured, 'Git Bash', inferShellKind(configured, 'Git Bash'), 'win32') === 'git-bash';
    return isGitBash && options.exists(configured) ? configured : null;
}

function detectGitBash(options: Required<Pick<TerminalProfileDiscoveryOptions, 'env' | 'exists'>>): string | null {
    const candidates = [
        windowsProgramPath(options.env, 'Git', 'bin', 'bash.exe'),
        windowsProgramPath(options.env, 'Git', 'usr', 'bin', 'bash.exe'),
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
        ...findGitBashOnPath(options.env)
    ];

    return firstExisting(candidates, options.exists);
}

function detectPwsh(options: Required<Pick<TerminalProfileDiscoveryOptions, 'env' | 'exists'>>): string | null {
    const candidates = [
        windowsProgramPath(options.env, 'PowerShell', '7', 'pwsh.exe'),
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        ...findOnPath(options.env, 'pwsh.exe', 'win32')
    ];

    return firstExisting(candidates, options.exists);
}

function detectWindowsPowerShell(options: Required<Pick<TerminalProfileDiscoveryOptions, 'env' | 'exists'>>): string | null {
    const systemRoot = options.env.SystemRoot ?? 'C:\\Windows';
    return firstExisting([
        path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    ], options.exists);
}

function detectPosixShell(
    id: string,
    options: Required<Pick<TerminalProfileDiscoveryOptions, 'env' | 'exists'>>
): string | null {
    const envShell = options.env.SHELL && basenameAnyPlatform(options.env.SHELL) === id ? options.env.SHELL : '';
    return firstExisting([
        envShell,
        `/bin/${id}`,
        `/usr/bin/${id}`,
        ...findOnPath(options.env, id, 'posix')
    ], options.exists);
}

function addProfile(profiles: WebcodeTerminalProfile[], profile: WebcodeTerminalProfile | null, platform: NodeJS.Platform): void {
    if (!profile || profiles.some(existing => existing.id === profile.id)) {
        return;
    }

    const resolvedPath = profile.resolvedPath;
    const duplicatePath = resolvedPath
        ? profiles.some(existing => pathsEqual(existing.resolvedPath, resolvedPath, platform))
        : false;
    if (profile.id !== 'default' && duplicatePath) {
        return;
    }

    profiles.push(profile);
}

function inferProfileId(
    shellPath: string,
    name: string,
    shellKind: TerminalShellKind | null,
    platform: NodeJS.Platform
): string | null {
    const lowerName = name.toLowerCase();
    const baseName = basenameAnyPlatform(shellPath).toLowerCase();

    if (shellKind === 'powershell') {
        return baseName === 'pwsh.exe' || baseName === 'pwsh' ? 'pwsh' : 'powershell';
    }

    if (shellKind !== 'posix') {
        return null;
    }

    if (platform === 'win32') {
        return lowerName.includes('git') || /[\\/]git[\\/]/i.test(shellPath) ? 'git-bash' : null;
    }

    return POSIX_PROFILE_IDS.includes(baseName) ? baseName : null;
}

function inferShellKind(shellPath: string | undefined, profileName: string): TerminalShellKind | null {
    const combined = `${profileName} ${shellPath ?? ''}`.toLowerCase();
    const baseName = shellPath ? basenameAnyPlatform(shellPath).toLowerCase() : '';

    if (baseName === 'pwsh' || baseName === 'pwsh.exe' || baseName === 'powershell.exe') {
        return 'powershell';
    }

    if (baseName === 'bash' || baseName === 'bash.exe' || baseName === 'zsh' || baseName === 'sh') {
        return 'posix';
    }

    if (combined.includes('git bash')) {
        return 'posix';
    }

    return null;
}

function profileIdsForPlatform(platform: NodeJS.Platform): string[] {
    return platform === 'win32' ? WINDOWS_PROFILE_IDS : POSIX_PROFILE_IDS;
}

function syntaxForShellKind(shellKind: TerminalShellKind): string {
    return shellKind === 'powershell' ? 'PowerShell' : 'POSIX/bash';
}

function configPlatformKey(platform: NodeJS.Platform): 'windows' | 'osx' | 'linux' {
    if (platform === 'win32') {
        return 'windows';
    }

    return platform === 'darwin' ? 'osx' : 'linux';
}

function selectShellPath(value: unknown, exists: (candidate: string) => boolean): string | null {
    if (typeof value === 'string') {
        return usableShellPath(value, exists);
    }

    if (!Array.isArray(value)) {
        return null;
    }

    return value.map(item => typeof item === 'string' ? usableShellPath(item, exists) : null).find(Boolean) ?? null;
}

function usableShellPath(value: string, exists: (candidate: string) => boolean): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    return isAbsolutePath(trimmed) && !exists(trimmed) ? null : trimmed;
}

function selectShellArgs(value: unknown): string[] | string | undefined {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
        return value;
    }

    return undefined;
}

function windowsProgramPath(env: NodeJS.ProcessEnv, ...parts: string[]): string {
    const root = env.ProgramW6432 ?? env.ProgramFiles ?? '';
    return root ? path.win32.join(root, ...parts) : '';
}

function findGitBashOnPath(env: NodeJS.ProcessEnv): string[] {
    return findOnPath(env, 'bash.exe', 'win32')
        .filter(candidate => /[\\/]git[\\/]/i.test(candidate));
}

function findOnPath(env: NodeJS.ProcessEnv, executable: string, platform: 'win32' | 'posix'): string[] {
    const pathValue = env.Path ?? env.PATH ?? '';
    const delimiter = platform === 'win32' ? ';' : ':';
    const pathModule = platform === 'win32' ? path.win32 : path.posix;

    return pathValue
        .split(delimiter)
        .filter(Boolean)
        .map(entry => pathModule.join(entry, executable));
}

function firstExisting(candidates: string[], exists: (candidate: string) => boolean): string | null {
    return candidates.find(candidate => candidate && exists(candidate)) ?? null;
}

function pathsEqual(left: string | undefined, right: string, platform: NodeJS.Platform): boolean {
    if (!left) {
        return false;
    }

    const normalLeft = normalizePathKey(left, platform);
    const normalRight = normalizePathKey(right, platform);
    return normalLeft === normalRight;
}

function normalizePathKey(value: string, platform: NodeJS.Platform): string {
    return platform === 'win32'
        ? path.win32.normalize(value).toLowerCase()
        : path.posix.normalize(value);
}

function isAbsolutePath(value: string): boolean {
    return path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
}

function describeShellPath(shellPath: string | undefined): string {
    return shellPath ? basenameAnyPlatform(shellPath) : 'detected shell';
}

function basenameAnyPlatform(value: string): string {
    return value.split(/[\\/]/).pop() ?? value;
}

function sameProfileName(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
