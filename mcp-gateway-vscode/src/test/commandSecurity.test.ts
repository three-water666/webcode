import * as assert from 'assert';
import {
  formatCommandPolicyError,
  formatAllowedCommands,
  parseCommandLine,
  resolveExecutionPlan,
  validateParsedCommand,
} from '../servers/commandSecurity';

suite('Command Security', () => {
  test('rejects shell chaining syntax', () => {
    const result = parseCommandLine('git status && whoami');
    assert.strictEqual(result.ok, false);
  });

  test('formats chained-command errors with guidance', () => {
    const message = formatCommandPolicyError('Blocked shell control operator: "&"');
    assert.strictEqual(message.includes('exactly one command per call'), true);
    assert.strictEqual(message.includes('one command at a time'), true);
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

  test('blocks high-risk shell commands', () => {
    const parsed = parseCommandLine('powershell -Command "Get-ChildItem"');
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

  test('blocks interpreter inline evaluation flags', () => {
    const parsed = parseCommandLine('node -e "console.log(1)"');
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

  test('windows bare commands are wrapped through cmd.exe', () => {
    const parsed = parseCommandLine('agent-browser open https://example.com');
    assert.strictEqual(parsed.ok, true);

    if (!parsed.ok) {
      return;
    }

    const execution = resolveExecutionPlan(parsed.value, 'win32', { comspec: 'C:/Windows/System32/cmd.exe' });
    assert.strictEqual(execution.file, 'C:/Windows/System32/cmd.exe');
    assert.strictEqual(execution.args[0], '/d');
    assert.strictEqual(execution.args[3].startsWith('agent-browser '), true);
  });

  test('policy summary stays readable', () => {
    const allowed = formatAllowedCommands('linux');
    assert.strictEqual(allowed.includes('single command only'), true);
    assert.strictEqual(allowed.includes('workspace-scoped paths'), true);
  });
});
