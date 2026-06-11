import * as assert from 'assert';
import * as path from 'path';

import { browserCommandLineUsesProfile } from '../extension/processDetection';

suite('Browser process detection', () => {
    test('matches user data dir passed with equals syntax', () => {
        const profileDir = path.posix.join('/root', 'isolated-browser-profiles', 'edge');

        assert.strictEqual(
            browserCommandLineUsesProfile(`msedge --user-data-dir=${profileDir}`, profileDir, 'linux'),
            true
        );
    });

    test('does not match profile dirs that only share a path prefix', () => {
        const profileDir = path.posix.join('/root', 'isolated-browser-profiles', 'edge');

        assert.strictEqual(
            browserCommandLineUsesProfile(`msedge --user-data-dir=${profileDir}-backup`, profileDir, 'linux'),
            false
        );
        assert.strictEqual(
            browserCommandLineUsesProfile(`msedge --user-data-dir=${profileDir}2`, profileDir, 'linux'),
            false
        );
    });

    test('matches quoted user data dir passed as the next argument', () => {
        const profileDir = path.posix.join('/root', 'isolated-browser-profiles', 'edge profile');

        assert.strictEqual(
            browserCommandLineUsesProfile(`msedge --user-data-dir "${profileDir}"`, profileDir, 'linux'),
            true
        );
        assert.strictEqual(
            browserCommandLineUsesProfile(`msedge --user-data-dir '${profileDir}'`, profileDir, 'linux'),
            true
        );
    });

    test('matches quoted equals syntax and ignores trailing slashes', () => {
        const profileDir = path.posix.join('/root', 'isolated-browser-profiles', 'edge');

        assert.strictEqual(
            browserCommandLineUsesProfile(`msedge --user-data-dir="${profileDir}/"`, profileDir, 'linux'),
            true
        );
    });

    test('matches Windows profile paths case-insensitively', () => {
        const profileDir = path.win32.join('C:\\', 'Users', 'me', 'AppData', 'Local', 'webcode', 'edge');
        const commandProfileDir = path.win32.join('c:\\', 'users', 'ME', 'AppData', 'Local', 'webcode', 'edge');

        assert.strictEqual(
            browserCommandLineUsesProfile(`msedge.exe --user-data-dir="${commandProfileDir}"`, profileDir, 'win32'),
            true
        );
    });
});
