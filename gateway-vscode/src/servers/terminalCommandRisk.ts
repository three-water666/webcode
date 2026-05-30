import {
    assessShellCommandRisk,
    CommandRiskError,
    type CommandRiskAssessment
} from './commandRisk';
import type { TerminalShellKind } from './terminalProfiles';

const BLOCKED_POWERSHELL_COMMANDS = new Map<string, string>([
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

const POWERSHELL_REMOVE_ALIASES = new Set(['remove-item', 'rm', 'rmdir', 'rd', 'del', 'erase']);
const INTERPRETER_EVAL_FLAGS = new Map<string, string[]>([
    ['python', ['-c']],
    ['python.exe', ['-c']],
    ['python3', ['-c']],
    ['py', ['-c']],
    ['node', ['-e', '--eval', '-p', '--print']],
    ['node.exe', ['-e', '--eval', '-p', '--print']],
    ['bun', ['eval', '-e']]
]);

export function assessTerminalCommandRisk(command: string, shellKind: TerminalShellKind): CommandRiskAssessment {
    if (shellKind === 'posix') {
        return assessShellCommandRisk(command);
    }

    return assessPowerShellCommandRisk(command);
}

export function assertTerminalCommandRiskAllowed(command: string, shellKind: TerminalShellKind): void {
    const assessment = assessTerminalCommandRisk(command, shellKind);
    if (assessment.level !== 'allowed') {
        throw new CommandRiskError(assessment);
    }
}

function assessPowerShellCommandRisk(command: string): CommandRiskAssessment {
    const blocked: string[] = [];
    const dangerous: string[] = [];

    if (pipesIntoPowerShellEval(command)) {
        blocked.push('Piping downloaded or generated content into Invoke-Expression is not allowed.');
    }

    for (const segment of splitPowerShellSegments(command)) {
        assessPowerShellSegment(segment, blocked, dangerous);
    }

    const reasons = unique(blocked.length > 0 ? blocked : dangerous);
    return {
        level: blocked.length > 0 ? 'blocked' : dangerous.length > 0 ? 'dangerous' : 'allowed',
        reasons
    };
}

function assessPowerShellSegment(segment: string, blocked: string[], dangerous: string[]): void {
    const words = splitPowerShellWords(segment);
    const commandName = normalizeCommandName(findPowerShellCommand(words));
    if (!commandName) {
        return;
    }

    const args = words.slice(1);
    const blockedReason = BLOCKED_POWERSHELL_COMMANDS.get(commandName);
    if (blockedReason) {
        blocked.push(blockedReason);
        return;
    }

    if ((commandName === 'powershell' || commandName === 'pwsh') && hasPowerShellCommandFlag(args)) {
        blocked.push(`Nested PowerShell command evaluation with ${commandName} is not allowed.`);
        return;
    }

    dangerous.push(...assessSharedDangerousCommand(commandName, args));
    dangerous.push(...assessPowerShellRemove(commandName, args));
}

function assessSharedDangerousCommand(commandName: string, args: string[]): string[] {
    if (commandName === 'git') {
        return assessGit(args);
    }

    const evalFlags = INTERPRETER_EVAL_FLAGS.get(commandName);
    if (evalFlags && args.some(arg => evalFlags.includes(arg.toLowerCase()))) {
        return [`Inline code execution with ${commandName} is not allowed.`];
    }

    return [];
}

function assessPowerShellRemove(commandName: string, args: string[]): string[] {
    if (!POWERSHELL_REMOVE_ALIASES.has(commandName) || !hasPowerShellRecursiveFlag(args)) {
        return [];
    }

    const targets = args.filter(arg => !arg.startsWith('-'));
    if (targets.some(isDangerousRemovalTarget)) {
        return ['Recursive removal of workspace root, parent paths, .git, variables, or broad wildcards is not allowed.'];
    }

    return [];
}

function assessGit(args: string[]): string[] {
    const subcommand = args[0]?.toLowerCase();
    if (subcommand === 'reset' && args.some(arg => arg.toLowerCase() === '--hard')) {
        return ['git reset --hard is not allowed.'];
    }

    if (subcommand === 'clean' && hasCombinedFlags(args, ['f', 'd', 'x'])) {
        return ['git clean -fdx is not allowed.'];
    }

    if (subcommand === 'push' && args.some(isForcePushFlag)) {
        return ['Force-pushing with git push is not allowed.'];
    }

    return [];
}

function splitPowerShellSegments(command: string): string[] {
    const segments: string[] = [];
    let current = '';
    let quote: '"' | '\'' | null = null;
    let escaping = false;

    for (const char of command) {
        if (escaping) {
            current += char;
            escaping = false;
            continue;
        }

        if (char === '`') {
            current += char;
            escaping = true;
            continue;
        }

        if (quote) {
            current += char;
            quote = char === quote ? null : quote;
            continue;
        }

        if (char === '"' || char === '\'') {
            quote = char;
            current += char;
            continue;
        }

        if (char === ';' || char === '|' || char === '\n' || char === '\r') {
            pushSegment(segments, current);
            current = '';
            continue;
        }

        current += char;
    }

    pushSegment(segments, current);
    return segments;
}

function splitPowerShellWords(segment: string): string[] {
    const words: string[] = [];
    let current = '';
    let quote: '"' | '\'' | null = null;
    let escaping = false;

    for (const char of segment.trim()) {
        if (escaping) {
            current += char;
            escaping = false;
            continue;
        }

        if (char === '`') {
            escaping = true;
            continue;
        }

        if (quote) {
            quote = char === quote ? null : quote;
            if (quote) {
                current += char;
            }
            continue;
        }

        if (char === '"' || char === '\'') {
            quote = char;
            continue;
        }

        if (/\s/.test(char)) {
            pushWord(words, current);
            current = '';
            continue;
        }

        current += char;
    }

    pushWord(words, current);
    return words;
}

function findPowerShellCommand(words: string[]): string | undefined {
    let index = 0;
    while (isPowerShellAssignment(words[index])) {
        index += 1;
    }

    return words[index];
}

function pipesIntoPowerShellEval(command: string): boolean {
    return /\|\s*(?:invoke-expression|iex)(?:\s|$)/i.test(command);
}

function isPowerShellAssignment(value: string | undefined): boolean {
    return Boolean(value && /^\$env:[A-Za-z_][A-Za-z0-9_]*=/.test(value));
}

function hasPowerShellCommandFlag(args: string[]): boolean {
    return args.some(arg => {
        const lower = arg.toLowerCase();
        return lower === '-command' || lower === '-c' || lower === '/c';
    });
}

function hasPowerShellRecursiveFlag(args: string[]): boolean {
    return args.some(arg => {
        const lower = arg.toLowerCase();
        return lower === '-recurse' || lower === '-recursive' || lower === '-r';
    });
}

function isDangerousRemovalTarget(target: string): boolean {
    const lower = target.toLowerCase();
    const exactTargets = new Set(['/', '~', '.', '..', '*', './*', '/*', '~/*', '.git', '$pwd', '$home']);
    return exactTargets.has(lower)
        || lower.startsWith('..\\')
        || lower.startsWith('../')
        || lower.startsWith('$')
        || lower.includes('\\.git')
        || lower.includes('/.git')
        || /^[a-z]:[\\/]*$/i.test(target);
}

function hasCombinedFlags(args: string[], requiredFlags: string[]): boolean {
    const flagChars = args
        .filter(arg => /^-[A-Za-z]+$/.test(arg))
        .join('')
        .toLowerCase();

    return requiredFlags.every(flag => flagChars.includes(flag));
}

function isForcePushFlag(arg: string): boolean {
    const lower = arg.toLowerCase();
    return lower === '--force' || lower === '-f' || lower.startsWith('--force-with-lease');
}

function normalizeCommandName(command: string | undefined): string {
    if (!command) {
        return '';
    }

    return (command.split(/[\\/]/).pop() ?? command).toLowerCase();
}

function pushSegment(segments: string[], segment: string): void {
    const trimmed = segment.trim();
    if (trimmed) {
        segments.push(trimmed);
    }
}

function pushWord(words: string[], word: string): void {
    if (word) {
        words.push(word);
    }
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}
