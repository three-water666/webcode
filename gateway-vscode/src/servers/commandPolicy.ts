import type { CommandRiskIssue } from './commandRiskTypes';
import type { ParsedShellCommand, ParsedShellSegment } from './shellCommandParser';

const POSIX_BLOCKED_COMMANDS = new Map<string, string>([
    ['sudo', 'Privilege escalation with sudo is not allowed.'],
    ['su', 'Privilege escalation with su is not allowed.'],
    ['cmd', 'cmd.exe is not allowed; use POSIX shell syntax.'],
    ['powershell', 'PowerShell is not allowed; use POSIX shell syntax.'],
    ['pwsh', 'PowerShell is not allowed; use POSIX shell syntax.'],
    ['shutdown', 'System shutdown commands are not allowed.'],
    ['reboot', 'System reboot commands are not allowed.'],
    ['halt', 'System shutdown commands are not allowed.'],
    ['poweroff', 'System shutdown commands are not allowed.'],
    ['diskpart', 'Disk partitioning commands are not allowed.'],
    ['format', 'Disk formatting commands are not allowed.'],
    ['reg', 'Windows registry commands are not allowed.'],
    ['sc', 'Windows service control commands are not allowed.'],
    ['netsh', 'Network configuration commands are not allowed.'],
    ['mkfs', 'Filesystem formatting commands are not allowed.'],
    ['dd', 'Raw disk copy commands are not allowed.']
]);

const POWERSHELL_BLOCKED_COMMANDS = new Map<string, string>([
    ['cmd', 'cmd.exe is not allowed from PowerShell terminal commands.'],
    ['cmd.exe', 'cmd.exe is not allowed from PowerShell terminal commands.'],
    ['diskpart', 'Disk partitioning commands are not allowed.'],
    ['format', 'Disk formatting commands are not allowed.'],
    ['reg', 'Windows registry commands are not allowed.'],
    ['reg.exe', 'Windows registry commands are not allowed.'],
    ['sc', 'Windows service control commands are not allowed.'],
    ['sc.exe', 'Windows service control commands are not allowed.'],
    ['netsh', 'Network configuration commands are not allowed.'],
    ['shutdown', 'System shutdown commands are not allowed.'],
    ['shutdown.exe', 'System shutdown commands are not allowed.'],
    ['stop-computer', 'System shutdown commands are not allowed.'],
    ['restart-computer', 'System restart commands are not allowed.'],
    ['set-executionpolicy', 'Changing PowerShell execution policy is not allowed.'],
    ['invoke-expression', 'Invoke-Expression is not allowed.'],
    ['iex', 'Invoke-Expression is not allowed.']
]);

const POSIX_SHELL_COMMANDS = new Set(['bash', 'sh', 'zsh', 'fish']);
const POWERSHELL_COMMANDS = new Set(['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe']);
const POWERSHELL_EVAL_COMMANDS = new Set(['invoke-expression', 'iex']);

const POSIX_INTERPRETER_EVAL_FLAGS = new Map<string, string[]>([
    ['python', ['-c']],
    ['python3', ['-c']],
    ['py', ['-c']],
    ['node', ['-e', '--eval', '-p', '--print']],
    ['deno', ['eval']],
    ['ruby', ['-e']],
    ['perl', ['-e']],
    ['php', ['-r']],
    ['bun', ['eval', '-e']]
]);

const POWERSHELL_INTERPRETER_EVAL_FLAGS = new Map<string, string[]>([
    ['python', ['-c']],
    ['python.exe', ['-c']],
    ['python3', ['-c']],
    ['py', ['-c']],
    ['node', ['-e', '--eval', '-p', '--print']],
    ['node.exe', ['-e', '--eval', '-p', '--print']],
    ['bun', ['eval', '-e']]
]);

export function assessCommandPolicy(parsed: ParsedShellCommand): CommandRiskIssue[] {
    return parsed.segments.flatMap(segment => assessSegmentPolicy(parsed, segment));
}

function assessSegmentPolicy(parsed: ParsedShellCommand, segment: ParsedShellSegment): CommandRiskIssue[] {
    const pipeIssue = assessPipePolicy(parsed, segment);
    if (pipeIssue) {
        return [pipeIssue];
    }

    if (!segment.commandName) {
        return [];
    }

    return parsed.shellKind === 'powershell'
        ? assessPowerShellSegmentPolicy(segment)
        : assessPosixSegmentPolicy(segment);
}

function assessPipePolicy(parsed: ParsedShellCommand, segment: ParsedShellSegment): CommandRiskIssue | null {
    if (segment.operatorBefore !== '|') {
        return null;
    }

    if (parsed.shellKind === 'powershell' && POWERSHELL_EVAL_COMMANDS.has(segment.commandName)) {
        return blocked('Piping downloaded or generated content into Invoke-Expression is not allowed.');
    }
    if (parsed.shellKind === 'posix' && POSIX_SHELL_COMMANDS.has(segment.commandName)) {
        return blocked('Piping data into a shell interpreter is not allowed.');
    }

    return null;
}

function assessPosixSegmentPolicy(segment: ParsedShellSegment): CommandRiskIssue[] {
    const blockedReason = POSIX_BLOCKED_COMMANDS.get(segment.commandName);
    if (blockedReason) {
        return [blocked(blockedReason)];
    }

    const shellIssue = assessNestedPosixShell(segment);
    if (shellIssue) {
        return [shellIssue];
    }

    return [
        ...assessInterpreterEval(segment.commandName, segment.args, POSIX_INTERPRETER_EVAL_FLAGS),
        ...assessSharedCommandPolicy(segment.commandName, segment.args)
    ];
}

function assessPowerShellSegmentPolicy(segment: ParsedShellSegment): CommandRiskIssue[] {
    const blockedReason = POWERSHELL_BLOCKED_COMMANDS.get(segment.commandName);
    if (blockedReason) {
        return [blocked(blockedReason)];
    }

    const shellIssue = assessNestedPowerShell(segment);
    if (shellIssue) {
        return [shellIssue];
    }

    return [
        ...assessInterpreterEval(segment.commandName, segment.args, POWERSHELL_INTERPRETER_EVAL_FLAGS),
        ...assessSharedCommandPolicy(segment.commandName, segment.args)
    ];
}

function assessNestedPosixShell(segment: ParsedShellSegment): CommandRiskIssue | null {
    if (POSIX_SHELL_COMMANDS.has(segment.commandName) && hasShellEvalFlag(segment.args)) {
        return blocked(`Nested shell evaluation with ${segment.commandName} -c is not allowed.`);
    }

    return null;
}

function assessNestedPowerShell(segment: ParsedShellSegment): CommandRiskIssue | null {
    if (POWERSHELL_COMMANDS.has(segment.commandName) && hasPowerShellCommandFlag(segment.args)) {
        return blocked(`Nested PowerShell command evaluation with ${segment.commandName} is not allowed.`);
    }

    return null;
}

function assessSharedCommandPolicy(commandName: string, args: string[]): CommandRiskIssue[] {
    if (commandName === 'git') {
        return assessGit(args);
    }
    if (commandName === 'find' && args.includes('-delete')) {
        return [dangerous('find -delete can remove many files and is not allowed.')];
    }
    if (commandName === 'chmod' && hasRecursiveFlag(args) && args.includes('777')) {
        return [dangerous('Recursive chmod 777 is not allowed.')];
    }
    if (commandName === 'chown' && hasRecursiveFlag(args)) {
        return [dangerous('Recursive chown is not allowed.')];
    }

    return [];
}

function assessGit(args: string[]): CommandRiskIssue[] {
    const subcommand = args[0]?.toLowerCase();
    if (subcommand === 'reset' && args.some(arg => arg.toLowerCase() === '--hard')) {
        return [dangerous('git reset --hard is not allowed.')];
    }
    if (subcommand === 'clean' && hasCombinedFlags(args, ['f', 'd', 'x'])) {
        return [dangerous('git clean -fdx is not allowed.')];
    }
    if (subcommand === 'push' && args.some(isForcePushFlag)) {
        return [dangerous('Force-pushing with git push is not allowed.')];
    }

    return [];
}

function assessInterpreterEval(
    commandName: string,
    args: string[],
    evalFlags: Map<string, string[]>
): CommandRiskIssue[] {
    const flags = evalFlags.get(commandName);
    if (!flags || !args.some(arg => flags.includes(arg.toLowerCase()))) {
        return [];
    }

    return [dangerous(`Inline code execution with ${commandName} is not allowed.`)];
}

function hasRecursiveFlag(args: string[]): boolean {
    return args.some(arg => arg === '--recursive' || /^-[^-]*[rR]/.test(arg));
}

function hasCombinedFlags(args: string[], requiredFlags: string[]): boolean {
    const flagChars = args
        .filter(arg => /^-[A-Za-z]+$/.test(arg))
        .join('')
        .toLowerCase();

    return requiredFlags.every(flag => flagChars.includes(flag));
}

function hasShellEvalFlag(args: string[]): boolean {
    return args.some(arg => /^-[^-]*c/.test(arg) || arg === '--command');
}

function hasPowerShellCommandFlag(args: string[]): boolean {
    return args.some(arg => {
        const lower = arg.toLowerCase();
        return lower === '-command'
            || lower === '-c'
            || lower === '/c'
            || lower === '-encodedcommand'
            || lower === '-enc'
            || lower === '/encodedcommand'
            || lower === '/enc';
    });
}

function isForcePushFlag(arg: string): boolean {
    const lower = arg.toLowerCase();
    return lower === '--force' || lower === '-f' || lower.startsWith('--force-with-lease');
}

function blocked(reason: string): CommandRiskIssue {
    return { level: 'blocked', reason };
}

function dangerous(reason: string): CommandRiskIssue {
    return { level: 'dangerous', reason };
}
