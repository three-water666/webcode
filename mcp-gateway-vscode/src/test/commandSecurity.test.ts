import * as assert from 'assert';
import {
  formatAllowedCommands,
  getAllowedCommandsForPlatform,
  parseCommandLine,
  resolveExecutionPlan,
  validateParsedCommand,
} from '../servers/commandSecurity';

suite('Command Security', () => {
  test('rejects shell chaining syntax', () => {
    const result = parseCommandLine('git status && whoami');
    assert.strictEqual(result.ok, false);
  });

  test('parses quoted arguments without invoking shell', () => {
    const result = parseCommandLine('git commit -m "hello world"');
    assert.strictEqual(result.ok, true);

    if (!result.ok) {
      return;
    }

    assert.strictEqual(result.value.baseCommand, 'git');
    assert.deepStrictEqual(result.value.args, ['commit', '-m', 'hello world']);
  });

  test('blocks parent-directory traversal arguments', () => {
    const parsed = parseCommandLine('git diff ../secret.txt');
    assert.strictEqual(parsed.ok, true);

    if (!parsed.ok) {
      return;
    }

    const validation = validateParsedCommand(parsed.value, {
      projectRoot: 'C:/repo',
      platform: 'win32'
    });

    assert.strictEqual(validation.valid, false);
  });

  test('blocks workspace-escape flags', () => {
    const parsed = parseCommandLine('git -C C:/other status');
    assert.strictEqual(parsed.ok, true);

    if (!parsed.ok) {
      return;
    }

    const validation = validateParsedCommand(parsed.value, {
      projectRoot: 'C:/repo',
      platform: 'win32'
    });

    assert.strictEqual(validation.valid, false);
  });

  test('platform allowlist differs between windows and posix', () => {
    const windowsAllowed = getAllowedCommandsForPlatform('win32');
    const linuxAllowed = getAllowedCommandsForPlatform('linux');

    assert.strictEqual(windowsAllowed.has('ls'), false);
    assert.strictEqual(linuxAllowed.has('ls'), true);
  });

  test('windows shim commands are wrapped through cmd.exe', () => {
    const parsed = parseCommandLine('npm run build');
    assert.strictEqual(parsed.ok, true);

    if (!parsed.ok) {
      return;
    }

    const execution = resolveExecutionPlan(parsed.value, 'win32', { comspec: 'C:/Windows/System32/cmd.exe' });
    assert.strictEqual(execution.file, 'C:/Windows/System32/cmd.exe');
    assert.strictEqual(execution.args[0], '/d');
    assert.strictEqual(execution.args[3].startsWith('npm.cmd '), true);
  });

  test('allowed command list stays readable', () => {
    const allowed = formatAllowedCommands('linux');
    assert.strictEqual(allowed.includes('git'), true);
    assert.strictEqual(allowed.includes('npm'), true);
  });
});
