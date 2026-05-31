import type { TerminalShellKind } from './terminalProfiles';

export type ShellCommandOperator = ';' | '|' | '&' | '&&' | '||' | 'newline';

export interface ParsedShellCommand {
    shellKind: TerminalShellKind;
    segments: ParsedShellSegment[];
}

export interface ParsedShellSegment {
    raw: string;
    words: string[];
    commandIndex: number;
    commandToken: string;
    commandName: string;
    args: string[];
    operatorBefore?: ShellCommandOperator;
    operatorAfter?: ShellCommandOperator;
}

interface RawShellSegment {
    raw: string;
    operatorBefore?: ShellCommandOperator;
    operatorAfter?: ShellCommandOperator;
}

export function parseShellCommand(command: string, shellKind: TerminalShellKind): ParsedShellCommand {
    return {
        shellKind,
        segments: splitShellSegments(command, shellKind).map(segment => parseShellSegment(segment, shellKind))
    };
}

function parseShellSegment(segment: RawShellSegment, shellKind: TerminalShellKind): ParsedShellSegment {
    const words = splitShellWords(segment.raw, shellKind);
    const commandIndex = findCommandIndex(words, shellKind);
    const commandToken = commandIndex >= 0 ? words[commandIndex] : '';

    return {
        raw: segment.raw,
        words,
        commandIndex,
        commandToken,
        commandName: normalizeCommandName(commandToken, shellKind),
        args: commandIndex >= 0 ? words.slice(commandIndex + 1) : [],
        operatorBefore: segment.operatorBefore,
        operatorAfter: segment.operatorAfter
    };
}

function splitShellSegments(command: string, shellKind: TerminalShellKind): RawShellSegment[] {
    const segments: RawShellSegment[] = [];
    let current = '';
    let quote: '"' | '\'' | null = null;
    let escaping = false;
    let operatorBefore: ShellCommandOperator | undefined;

    for (let index = 0; index < command.length; index++) {
        const char = command[index];
        if (escaping) {
            current += char;
            escaping = false;
            continue;
        }

        if (isEscapeChar(char, quote, shellKind)) {
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

        const delimiter = readDelimiter(command, index, shellKind);
        if (delimiter) {
            operatorBefore = pushRawSegment(segments, current, operatorBefore, delimiter.operator);
            current = '';
            index += delimiter.width - 1;
            continue;
        }

        current += char;
    }

    pushRawSegment(segments, current, operatorBefore, undefined);
    return segments;
}

function splitShellWords(segment: string, shellKind: TerminalShellKind): string[] {
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

        if (isEscapeChar(char, quote, shellKind)) {
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

function readDelimiter(
    command: string,
    index: number,
    shellKind: TerminalShellKind
): { operator: ShellCommandOperator; width: number } | null {
    const char = command[index];
    const next = command[index + 1];

    if (char === '&' && next === '&') {
        return { operator: '&&', width: 2 };
    }
    if (char === '|' && next === '|') {
        return { operator: '||', width: 2 };
    }
    if (char === ';' || char === '|') {
        return { operator: char, width: 1 };
    }
    if (char === '&' && shellKind === 'posix') {
        return { operator: '&', width: 1 };
    }
    if (char === '\n' || char === '\r') {
        return { operator: 'newline', width: 1 };
    }

    return null;
}

function pushRawSegment(
    segments: RawShellSegment[],
    segment: string,
    operatorBefore: ShellCommandOperator | undefined,
    operatorAfter: ShellCommandOperator | undefined
): ShellCommandOperator | undefined {
    const trimmed = segment.trim();
    if (!trimmed) {
        // Empty segments inherit the latest delimiter so the next command still
        // knows how it was chained, for example "cmd1 ; ; cmd2".
        return operatorAfter ?? operatorBefore;
    }

    segments.push({ raw: trimmed, operatorBefore, operatorAfter });
    return operatorAfter;
}

function findCommandIndex(words: string[], shellKind: TerminalShellKind): number {
    return shellKind === 'powershell'
        ? findPowerShellCommandIndex(words)
        : findPosixCommandIndex(words);
}

function findPosixCommandIndex(words: string[]): number {
    let index = 0;
    while (isEnvironmentAssignment(words[index])) {
        index += 1;
    }

    if (words[index] === 'env') {
        index += 1;
        while (isEnvironmentAssignment(words[index])) {
            index += 1;
        }
    }

    return index < words.length ? index : -1;
}

function findPowerShellCommandIndex(words: string[]): number {
    let index = 0;
    while (isPowerShellAssignment(words[index]) || isPowerShellInvocationOperator(words[index])) {
        index += 1;
    }

    return index < words.length ? index : -1;
}

function normalizeCommandName(command: string, shellKind: TerminalShellKind): string {
    const baseName = command.split(/[\\/]/).pop() ?? command;
    const lower = baseName.toLowerCase();
    return shellKind === 'posix' ? lower.replace(/\.(exe|cmd|bat|sh)$/i, '') : lower;
}

function isEscapeChar(char: string, quote: '"' | '\'' | null, shellKind: TerminalShellKind): boolean {
    if (shellKind === 'powershell') {
        return char === '`';
    }

    return char === '\\' && quote !== '\'';
}

function isEnvironmentAssignment(value: string | undefined): boolean {
    return Boolean(value && /^[A-Za-z_][A-Za-z0-9_]*=/.test(value));
}

function isPowerShellAssignment(value: string | undefined): boolean {
    return Boolean(value && /^\$env:[A-Za-z_][A-Za-z0-9_]*=/.test(value));
}

function isPowerShellInvocationOperator(value: string | undefined): boolean {
    return value === '&' || value === '.';
}

function pushWord(words: string[], word: string): void {
    if (word) {
        words.push(word);
    }
}
