import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { getErrorMessage } from './errorUtils';

export type BrowserFamily = 'chrome' | 'edge';

export const BROWSER_FAMILIES: readonly BrowserFamily[] = ['edge', 'chrome'];

export interface IsolatedBrowserProfilePaths {
    browserFamily: BrowserFamily;
    platform: NodeJS.Platform;
    profileRoot: string;
    profileDir: string;
    legacyProfileRoot: string;
    legacyProfileDir: string;
}

export interface ResolveIsolatedBrowserProfilePathsOptions {
    browserFamily: BrowserFamily;
    legacyStorageRoot: string;
    configuredProfileRoot?: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
}

export type ResolveIsolatedBrowserProfilePathsResult =
    | { status: 'ready'; paths: IsolatedBrowserProfilePaths }
    | { status: 'invalid-profile-root'; configuredProfileRoot: string };

export interface ClearIsolatedBrowserProfilesOptions {
    pathsByFamily: IsolatedBrowserProfilePaths[];
    target: 'current' | 'legacy';
    isProfileInUse: IsolatedBrowserProfileInUse;
}

export type ClearIsolatedBrowserProfilesResult =
    | { status: 'cleared' }
    | ClearIsolatedBrowserProfilesFailure;

export type ClearIsolatedBrowserProfilesFailure =
    | { status: 'blocked-in-use'; browserFamily: BrowserFamily; profileDir: string }
    | { status: 'failed'; message: string };

export type IsolatedBrowserProfileInUse = (
    browserFamily: BrowserFamily,
    profileDir: string
) => Promise<boolean>;

const PRODUCT_DATA_DIR_NAME = 'webcode';
const PROFILE_ROOT_DIR_NAME = 'isolated-browser-profiles';

export function resolveIsolatedBrowserProfilePaths(
    options: ResolveIsolatedBrowserProfilePathsOptions
): ResolveIsolatedBrowserProfilePathsResult {
    const homeDir = options.homeDir ?? os.homedir();
    const platform = options.platform ?? os.platform();
    const env = options.env ?? process.env;
    const configuredProfileRoot = options.configuredProfileRoot?.trim();
    const platformPath = getPathModule(platform);
    const profileRoot = configuredProfileRoot
        ? expandHomePath(configuredProfileRoot, homeDir)
        : resolveDefaultIsolatedBrowserProfileRoot(platform, env, homeDir);

    if (configuredProfileRoot && !platformPath.isAbsolute(profileRoot)) {
        return { status: 'invalid-profile-root', configuredProfileRoot };
    }

    const resolvedProfileRoot = platformPath.resolve(profileRoot);
    const legacyProfileRoot = platformPath.join(options.legacyStorageRoot, PROFILE_ROOT_DIR_NAME);

    return {
        status: 'ready',
        paths: {
            browserFamily: options.browserFamily,
            platform,
            profileRoot: resolvedProfileRoot,
            profileDir: platformPath.join(resolvedProfileRoot, options.browserFamily),
            legacyProfileRoot,
            legacyProfileDir: platformPath.join(legacyProfileRoot, options.browserFamily)
        }
    };
}

export function resolveDefaultIsolatedBrowserProfileRoot(
    platform: NodeJS.Platform,
    env: NodeJS.ProcessEnv = process.env,
    homeDir: string = os.homedir()
): string {
    const platformPath = getPathModule(platform);
    if (platform === 'win32') {
        const localAppData = env.LOCALAPPDATA && platformPath.isAbsolute(env.LOCALAPPDATA)
            ? env.LOCALAPPDATA
            : platformPath.join(homeDir, 'AppData', 'Local');
        return platformPath.join(localAppData, PRODUCT_DATA_DIR_NAME, PROFILE_ROOT_DIR_NAME);
    }

    if (platform === 'darwin') {
        return platformPath.join(homeDir, 'Library', 'Application Support', PRODUCT_DATA_DIR_NAME, PROFILE_ROOT_DIR_NAME);
    }

    const dataHome = env.XDG_DATA_HOME && platformPath.isAbsolute(env.XDG_DATA_HOME)
        ? env.XDG_DATA_HOME
        : platformPath.join(homeDir, '.local', 'share');
    return platformPath.join(dataHome, PRODUCT_DATA_DIR_NAME, PROFILE_ROOT_DIR_NAME);
}

export function expandHomePath(filePath: string, homeDir: string = os.homedir()): string {
    if (filePath === '~') {
        return homeDir;
    }

    if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
        return path.join(homeDir, filePath.slice(2));
    }

    return filePath;
}

export async function ensureCurrentIsolatedBrowserProfile(paths: IsolatedBrowserProfilePaths): Promise<string> {
    await fs.mkdir(paths.profileDir, { recursive: true });
    return paths.profileDir;
}

export async function hasLegacyIsolatedBrowserProfiles(pathsByFamily: IsolatedBrowserProfilePaths[]): Promise<boolean> {
    const legacyDirs = pathsByFamily.map(paths => paths.legacyProfileDir);
    return pathListIncludesExistingPath(legacyDirs);
}

export async function hasCurrentIsolatedBrowserProfiles(pathsByFamily: IsolatedBrowserProfilePaths[]): Promise<boolean> {
    const profileDirs = pathsByFamily.map(paths => paths.profileDir);
    return pathListIncludesExistingPath(profileDirs);
}

export async function clearIsolatedBrowserProfiles(
    options: ClearIsolatedBrowserProfilesOptions
): Promise<ClearIsolatedBrowserProfilesResult> {
    const targetDirs = getTargetProfileDirs(options.pathsByFamily, options.target);
    const inUseProfile = await findInUseProfile(options, targetDirs);
    if (inUseProfile) {
        return {
            status: 'blocked-in-use',
            browserFamily: inUseProfile.browserFamily,
            profileDir: inUseProfile.profileDir
        };
    }

    try {
        await removeProfileDirs(targetDirs);
        await removeEmptyRoots(options.pathsByFamily, options.target);
        return { status: 'cleared' };
    } catch (error: unknown) {
        return { status: 'failed', message: getErrorMessage(error) };
    }
}

async function findInUseProfile(
    options: ClearIsolatedBrowserProfilesOptions,
    targetDirs: ProfileDirectoryTarget[]
): Promise<{ browserFamily: BrowserFamily; profileDir: string } | null> {
    for (const target of targetDirs) {
        if (await pathExists(target.profileDir) &&
            await options.isProfileInUse(target.browserFamily, target.profileDir)) {
            return target;
        }
    }

    return null;
}

function getTargetProfileDirs(
    pathsByFamily: IsolatedBrowserProfilePaths[],
    target: 'current' | 'legacy'
): ProfileDirectoryTarget[] {
    return pathsByFamily.map(paths => ({
        browserFamily: paths.browserFamily,
        platform: paths.platform,
        profileDir: target === 'current' ? paths.profileDir : paths.legacyProfileDir
    }));
}

interface ProfileDirectoryTarget {
    browserFamily: BrowserFamily;
    platform: NodeJS.Platform;
    profileDir: string;
}

async function removeProfileDirs(targetDirs: ProfileDirectoryTarget[]): Promise<void> {
    for (const profileDir of uniqueProfileDirectoryTargets(targetDirs)) {
        await fs.rm(profileDir, { recursive: true, force: true });
    }
}

async function removeEmptyRoots(
    pathsByFamily: IsolatedBrowserProfilePaths[],
    target: 'current' | 'legacy'
): Promise<void> {
    const roots = pathsByFamily.map(paths => target === 'current' ? paths.profileRoot : paths.legacyProfileRoot);
    for (const root of uniquePaths(roots, getProfilePathsPlatform(pathsByFamily))) {
        await removeDirectoryIfEmpty(root);
    }
}

async function removeDirectoryIfEmpty(directoryPath: string): Promise<void> {
    try {
        await fs.rmdir(directoryPath);
    } catch (error: unknown) {
        if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTEMPTY') || hasErrorCode(error, 'EEXIST')) {
            return;
        }
        throw error;
    }
}

async function pathListIncludesExistingPath(pathsToCheck: string[]): Promise<boolean> {
    const results = await Promise.all(pathsToCheck.map(pathExists));
    return results.some(Boolean);
}

function uniqueProfileDirectoryTargets(targetDirs: ProfileDirectoryTarget[]): string[] {
    const pathsByKey = new Map<string, string>();
    for (const target of targetDirs) {
        pathsByKey.set(normalizeComparablePath(target.profileDir, target.platform), target.profileDir);
    }
    return [...pathsByKey.values()];
}

function uniquePaths(pathsToDeduplicate: string[], platform: NodeJS.Platform): string[] {
    const pathsByKey = new Map<string, string>();
    for (const candidate of pathsToDeduplicate) {
        pathsByKey.set(normalizeComparablePath(candidate, platform), candidate);
    }
    return [...pathsByKey.values()];
}

function getProfilePathsPlatform(pathsByFamily: IsolatedBrowserProfilePaths[]): NodeJS.Platform {
    return pathsByFamily[0]?.platform ?? os.platform();
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.stat(filePath);
        return true;
    } catch (error: unknown) {
        if (hasErrorCode(error, 'ENOENT')) {
            return false;
        }
        throw error;
    }
}

function normalizeComparablePath(filePath: string, platform: NodeJS.Platform): string {
    const platformPath = getPathModule(platform);
    const normalized = platformPath.resolve(filePath).replace(/\\/g, '/').replace(/\/+$/g, '');
    if (platform === 'win32' || platform === 'darwin') {
        return normalized.toLowerCase();
    }

    return normalized;
}

function hasErrorCode(error: unknown, code: string): boolean {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === code;
}

function getPathModule(platform: NodeJS.Platform): path.PlatformPath {
    return platform === 'win32' ? path.win32 : path.posix;
}
