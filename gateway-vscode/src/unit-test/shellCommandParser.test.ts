import * as assert from 'assert';
import { parseShellCommand } from '../servers/shellCommandParser';

suite('Shell Command Parser', () => {
    test('splits POSIX and/or command chains', () => {
        const parsed = parseShellCommand('pnpm build && rm -rf ../outside || git status', 'posix');

        assert.deepStrictEqual(parsed.segments.map(segment => segment.commandName), ['pnpm', 'rm', 'git']);
        assert.deepStrictEqual(parsed.segments.map(segment => segment.operatorBefore), [undefined, '&&', '||']);
    });

    test('splits PowerShell and/or chains without treating invocation operator as a delimiter', () => {
        const parsed = parseShellCommand('pnpm build && & git status || . Invoke-Expression $script', 'powershell');

        assert.deepStrictEqual(parsed.segments.map(segment => segment.commandName), ['pnpm', 'git', 'invoke-expression']);
        assert.deepStrictEqual(parsed.segments.map(segment => segment.operatorBefore), [undefined, '&&', '||']);
    });

    test('keeps quoted delimiters inside a single command segment', () => {
        const parsed = parseShellCommand('node -e "console.log(1 && 2)" && pnpm test', 'posix');

        assert.deepStrictEqual(parsed.segments.map(segment => segment.commandName), ['node', 'pnpm']);
        assert.deepStrictEqual(parsed.segments[0]?.args, ['-e', 'console.log(1 && 2)']);
    });
});
