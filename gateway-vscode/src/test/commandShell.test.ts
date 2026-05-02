import * as assert from 'assert';
import {
  COMMAND_SHELL_ENV,
  normalizeShellCommand,
  resolveCommandShell,
  resolveShellExecutionPlan,
} from '../servers/commandShell';

suite('Command Shell', () => {
  test('rejects empty commands', () => {
    assert.throws(() => normalizeShellCommand('   '), /must not be empty/);
  });

  test('windows uses configured shell path and preserves shell syntax', () => {
    const shellPath = 'C:\\Tools\\Git\\bin\\bash.exe';
    const execution = resolveShellExecutionPlan('git status && pnpm build', {
      platform: 'win32',
      configuredPath: shellPath,
      exists: candidate => candidate === shellPath
    });

    assert.strictEqual(execution.file, shellPath);
    assert.deepStrictEqual(execution.args, ['-lc', 'git status && pnpm build']);
    assert.strictEqual(execution.shell.id, 'custom');
  });

  test('windows auto-detects Git Bash from ProgramFiles', () => {
    const shellPath = 'C:\\Program Files\\Git\\bin\\bash.exe';
    const shell = resolveCommandShell({
      platform: 'win32',
      env: { ProgramFiles: 'C:\\Program Files' },
      exists: candidate => candidate === shellPath
    });

    assert.strictEqual(shell.id, 'git-bash');
    assert.strictEqual(shell.path, shellPath);
  });

  test('windows can read configured shell path from environment', () => {
    const shellPath = 'D:\\Git\\bin\\bash.exe';
    const shell = resolveCommandShell({
      platform: 'win32',
      env: { [COMMAND_SHELL_ENV]: shellPath },
      exists: candidate => candidate === shellPath
    });

    assert.strictEqual(shell.id, 'custom');
    assert.strictEqual(shell.path, shellPath);
  });

  test('windows reports missing Git Bash clearly', () => {
    assert.throws(
      () => resolveCommandShell({ platform: 'win32', env: {}, exists: () => false }),
      /Git Bash is required/
    );
  });

  test('posix prefers supported user shell', () => {
    const shell = resolveCommandShell({
      platform: 'darwin',
      env: { SHELL: '/bin/zsh' },
      exists: candidate => candidate === '/bin/zsh'
    });

    assert.strictEqual(shell.id, 'zsh');
    assert.strictEqual(shell.path, '/bin/zsh');
  });

  test('posix falls back to sh without login flag', () => {
    const execution = resolveShellExecutionPlan('git status', {
      platform: 'linux',
      env: {},
      exists: candidate => candidate === '/bin/sh'
    });

    assert.strictEqual(execution.file, '/bin/sh');
    assert.deepStrictEqual(execution.args, ['-c', 'git status']);
  });
});
