import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
    clearIsolatedBrowserProfiles,
    ensureCurrentIsolatedBrowserProfile,
    hasLegacyIsolatedBrowserProfiles,
    resolveDefaultIsolatedBrowserProfileRoot,
    resolveIsolatedBrowserProfilePaths,
    type BrowserFamily,
    type IsolatedBrowserProfileInUse,
    type IsolatedBrowserProfilePaths
} from '../extension/isolatedBrowserProfiles';

suite('Isolated browser profiles', () => {
    test('resolves default roots outside VS Code extension storage', () => {
        assert.strictEqual(
            resolveDefaultIsolatedBrowserProfileRoot(
                'win32',
                { LOCALAPPDATA: path.win32.join('C:\\', 'Users', 'me', 'AppData', 'Local') },
                path.win32.join('C:\\', 'Users', 'me')
            ),
            path.win32.join('C:\\', 'Users', 'me', 'AppData', 'Local', 'webcode', 'isolated-browser-profiles')
        );
        assert.strictEqual(
            resolveDefaultIsolatedBrowserProfileRoot('darwin', {}, '/Users/me'),
            path.posix.join('/Users/me', 'Library', 'Application Support', 'webcode', 'isolated-browser-profiles')
        );
        assert.strictEqual(
            resolveDefaultIsolatedBrowserProfileRoot('linux', {}, '/home/me'),
            path.posix.join('/home/me', '.local', 'share', 'webcode', 'isolated-browser-profiles')
        );
    });

    test('creates a current profile in the app data directory', async () => {
        await withTempProfilePaths(async paths => {
            const profileDir = await ensureCurrentIsolatedBrowserProfile(paths);

            assert.strictEqual(profileDir, paths.profileDir);
            assert.strictEqual(await pathExists(paths.profileDir), true);
            assert.strictEqual(await pathExists(paths.legacyProfileDir), false);
        });
    });

    test('detects legacy profiles without creating or migrating current profiles', async () => {
        await withTempProfilePaths(async paths => {
            assert.strictEqual(await hasLegacyIsolatedBrowserProfiles([paths]), false);

            await fs.mkdir(paths.legacyProfileDir, { recursive: true });

            assert.strictEqual(await hasLegacyIsolatedBrowserProfiles([paths]), true);
            assert.strictEqual(await pathExists(paths.profileDir), false);
        });
    });

    test('clears only current isolated profile directories', async () => {
        await withTempProfilePaths(async paths => {
            await fs.mkdir(paths.profileDir, { recursive: true });
            await fs.mkdir(paths.legacyProfileDir, { recursive: true });

            const result = await clearIsolatedBrowserProfiles({
                pathsByFamily: [paths],
                target: 'current',
                isProfileInUse: neverInUse
            });

            assert.strictEqual(result.status, 'cleared');
            assert.strictEqual(await pathExists(paths.profileDir), false);
            assert.strictEqual(await pathExists(paths.legacyProfileDir), true);
        });
    });

    test('clears only legacy isolated profile directories', async () => {
        await withTempProfilePaths(async paths => {
            await fs.mkdir(paths.profileDir, { recursive: true });
            await fs.mkdir(paths.legacyProfileDir, { recursive: true });

            const result = await clearIsolatedBrowserProfiles({
                pathsByFamily: [paths],
                target: 'legacy',
                isProfileInUse: neverInUse
            });

            assert.strictEqual(result.status, 'cleared');
            assert.strictEqual(await pathExists(paths.profileDir), true);
            assert.strictEqual(await pathExists(paths.legacyProfileDir), false);
        });
    });

    test('does not clear profiles that are currently in use', async () => {
        await withTempProfilePaths(async paths => {
            await fs.mkdir(paths.profileDir, { recursive: true });

            const result = await clearIsolatedBrowserProfiles({
                pathsByFamily: [paths],
                target: 'current',
                isProfileInUse: onlyPathInUse(paths.profileDir)
            });

            assert.strictEqual(result.status, 'blocked-in-use');
            assert.strictEqual(await pathExists(paths.profileDir), true);
        });
    });
});

async function withTempProfilePaths(callback: (paths: IsolatedBrowserProfilePaths) => Promise<void>): Promise<void> {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'webcode-isolated-profile-'));
    try {
        await callback(createPaths(tempRoot, 'edge'));
    } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
}

function createPaths(tempRoot: string, browserFamily: BrowserFamily): IsolatedBrowserProfilePaths {
    const result = resolveIsolatedBrowserProfilePaths({
        browserFamily,
        legacyStorageRoot: path.join(tempRoot, 'legacy-storage'),
        configuredProfileRoot: path.join(tempRoot, 'app-data', 'isolated-browser-profiles')
    });
    assert.strictEqual(result.status, 'ready');
    return result.paths;
}

const neverInUse: IsolatedBrowserProfileInUse = () => Promise.resolve(false);

function onlyPathInUse(activeProfileDir: string): IsolatedBrowserProfileInUse {
    const normalizedActiveProfileDir = path.resolve(activeProfileDir);
    return (_browserFamily, profileDir) => Promise.resolve(path.resolve(profileDir) === normalizedActiveProfileDir);
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

function hasErrorCode(error: unknown, code: string): boolean {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === code;
}
