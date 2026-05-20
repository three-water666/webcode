import { spawn } from 'child_process';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { LocalTool } from './types';
import { textResult } from './result';
import {
    DEFAULT_EXCLUDED_DIRECTORIES,
    getNumberArg,
    getStringArrayArg,
    matchesPattern,
    normalizeLineEndings,
    resolveWorkspaceDirectory,
    toPosixPath,
    walkWorkspaceFiles
} from './filesystemUtils';

const MAX_FALLBACK_FILE_SIZE_BYTES = 1024 * 1024 * 2;

export const searchCodeTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'search_code',
        description: 'Search text content inside workspace files using ripgrep. Returns relative file paths with line numbers and matching lines.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', minLength: 1, description: 'Text or ripgrep regular expression to search for.' },
                path: { type: 'string', description: 'Optional workspace directory to search. Defaults to ".".' },
                include: { type: 'string', description: 'Optional glob for files to include, for example "**/*.ts".' },
                case_sensitive: { type: 'boolean', description: 'Whether matching is case-sensitive. Default: false.', default: false },
                use_regex: { type: 'boolean', description: 'Treat query as a ripgrep regular expression. Default: false.', default: false },
                max_results: { type: 'integer', minimum: 1, maximum: 500, description: 'Maximum matching lines to return. Default: 100.', default: 100 },
                exclude_patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to exclude.' }
            },
            required: ['query']
        },
        annotations: { readOnlyHint: true }
    },
    async execute(args, context) {
        const searchRoot = await resolveWorkspaceDirectory(context.workspaceRoot, args.path ?? '.');
        const workspaceRoot = context.workspaceRoot ?? searchRoot;
        const query = String(args.query);
        const maxResults = getNumberArg(args.max_results, 100);
        const excludePatterns = getStringArrayArg(args.exclude_patterns);
        const options = {
            searchRoot,
            workspaceRoot,
            query,
            maxResults,
            includePattern: typeof args.include === 'string' ? args.include : undefined,
            excludePatterns,
            caseSensitive: args.case_sensitive === true,
            useRegex: args.use_regex === true
        };
        const matches = await runRipgrepWithFallback(options);

        return textResult(matches.length > 0 ? matches.join('\n') : 'No matches found.');
    }
};

type RipgrepOptions = {
    searchRoot: string;
    workspaceRoot: string;
    query: string;
    maxResults: number;
    includePattern?: string;
    excludePatterns: string[];
    caseSensitive: boolean;
    useRegex: boolean;
};

type RipgrepMatchMessage = {
    type: string;
    data?: {
        path?: { text?: string };
        lines?: { text?: string };
        line_number?: number;
    };
};

type RipgrepCommand = {
    command: string;
    source: string;
    checkedLocations: string[];
};

class RipgrepUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RipgrepUnavailableError';
    }
}

async function runRipgrepWithFallback(options: RipgrepOptions): Promise<string[]> {
    try {
        return await runRipgrep(options);
    } catch (error) {
        if (error instanceof RipgrepUnavailableError) {
            return searchCodeInProcess(options);
        }

        throw error;
    }
}

async function runRipgrep(options: RipgrepOptions): Promise<string[]> {
    const rgCommand = resolveRipgrepCommand();
    const args = createRipgrepArgs(options);
    const matches: string[] = [];
    let limitReached = false;
    let stdoutBuffer = '';
    let stderr = '';

    return new Promise((resolve, reject) => {
        const child = spawn(rgCommand.command, args, {
            cwd: options.searchRoot,
            windowsHide: true
        });
        let spawnFailed = false;

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            stdoutBuffer += chunk;

            let newlineIndex = stdoutBuffer.indexOf('\n');
            while (newlineIndex >= 0) {
                const line = stdoutBuffer.slice(0, newlineIndex);
                stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
                appendRipgrepMatch(line, options, matches);

                if (matches.length >= options.maxResults) {
                    limitReached = true;
                    child.kill();
                    break;
                }

                newlineIndex = stdoutBuffer.indexOf('\n');
            }
        });

        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });

        child.on('error', error => {
            spawnFailed = true;
            reject(createRipgrepStartError(error, rgCommand));
        });
        child.on('close', code => {
            if (spawnFailed) {
                return;
            }
            if (stdoutBuffer.trim() && matches.length < options.maxResults) {
                appendRipgrepMatch(stdoutBuffer, options, matches);
            }

            if (code === 0 || code === 1 || limitReached) {
                resolve(matches.slice(0, options.maxResults));
                return;
            }

            reject(new Error(`search_code failed: ${stderr.trim() || `ripgrep exited with code ${code ?? 'unknown'}`}`));
        });
    });
}

function resolveRipgrepCommand(): RipgrepCommand {
    const checkedLocations: string[] = [];

    const configuredPath = getConfiguredRipgrepPath();
    if (configuredPath) {
        checkedLocations.push(`webcodeGateway.ripgrep.path: ${configuredPath}`);
        if (fs.existsSync(configuredPath)) {
            return {
                command: configuredPath,
                source: 'webcodeGateway.ripgrep.path',
                checkedLocations
            };
        }
    } else {
        checkedLocations.push('webcodeGateway.ripgrep.path: not set');
    }

    const vscodeRipgrepCandidates = getVSCodeRipgrepCandidates();

    for (const candidate of vscodeRipgrepCandidates) {
        checkedLocations.push(`VS Code bundled ripgrep: ${candidate}`);
        if (fs.existsSync(candidate)) {
            return {
                command: candidate,
                source: 'VS Code bundled ripgrep',
                checkedLocations
            };
        }
    }

    if (vscodeRipgrepCandidates.length === 0) {
        checkedLocations.push('VS Code bundled ripgrep: vscode.env.appRoot is not available');
    }

    const pathCommand = getRipgrepBinaryName(process.platform);
    checkedLocations.push(`PATH command: ${pathCommand}`);
    return {
        command: pathCommand,
        source: 'PATH',
        checkedLocations
    };
}

function getVSCodeRipgrepCandidates(): string[] {
    const binaryName = getRipgrepBinaryName(process.platform);
    if (!vscode.env.appRoot) {
        return [];
    }

    return [
        path.join(vscode.env.appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', binaryName),
        path.join(vscode.env.appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', binaryName),
        path.join(vscode.env.appRoot, 'node_modules.asar.unpacked', 'vscode-ripgrep', 'bin', binaryName),
        path.join(vscode.env.appRoot, 'node_modules', 'vscode-ripgrep', 'bin', binaryName)
    ];
}

function getConfiguredRipgrepPath(): string | undefined {
    const configuredPath = vscode.workspace
        .getConfiguration('webcodeGateway')
        .get<string>('ripgrep.path', '')
        .trim();
    return configuredPath || undefined;
}

function getRipgrepBinaryName(platform: string): string {
    return platform === 'win32' ? 'rg.exe' : 'rg';
}

function createRipgrepStartError(error: Error, rgCommand: RipgrepCommand): Error {
    const code = (error as NodeJS.ErrnoException).code;
    const detail = code ? `${error.message} (${code})` : error.message;
    return new RipgrepUnavailableError(
        [
            `search_code could not start ripgrep from ${rgCommand.source}: ${detail}`,
            `Platform: ${process.platform}-${process.arch}`,
            'Checked:',
            ...rgCommand.checkedLocations.map(location => `- ${location}`),
            'To enable search_code, install ripgrep so rg is on PATH, or set webcodeGateway.ripgrep.path to the absolute path of rg/rg.exe.'
        ].join('\n')
    );
}

async function searchCodeInProcess(options: RipgrepOptions): Promise<string[]> {
    const matcher = createFallbackMatcher(options.query, {
        caseSensitive: options.caseSensitive,
        useRegex: options.useRegex
    });
    const matches: string[] = [];

    await walkWorkspaceFiles(options.searchRoot, async (filePath, relativeToSearchRoot) => {
        if (
            options.includePattern &&
            !matchesPattern(relativeToSearchRoot, options.includePattern) &&
            !matchesPattern(path.basename(filePath), options.includePattern)
        ) {
            return false;
        }

        const stats = await fsPromises.stat(filePath);
        if (stats.size > MAX_FALLBACK_FILE_SIZE_BYTES) {
            return false;
        }

        const rawContent = await fsPromises.readFile(filePath, 'utf8').catch(() => null);
        if (rawContent == null || rawContent.includes('\0')) {
            return false;
        }

        const lines = normalizeLineEndings(rawContent).split('\n');
        for (let index = 0; index < lines.length; index++) {
            if (!matcher(lines[index])) {
                continue;
            }

            const relativePath = toPosixPath(path.relative(options.workspaceRoot, filePath));
            matches.push(`${relativePath}:${index + 1}: ${lines[index].trimEnd()}`);
            if (matches.length >= options.maxResults) {
                return true;
            }
        }

        return false;
    }, {
        excludePatterns: options.excludePatterns,
        includePattern: options.includePattern
    });

    return matches;
}

function createFallbackMatcher(query: string, options: { caseSensitive: boolean; useRegex: boolean }): (line: string) => boolean {
    if (options.useRegex) {
        const flags = options.caseSensitive ? '' : 'i';
        const regex = new RegExp(query, flags);
        return line => regex.test(line);
    }

    const needle = options.caseSensitive ? query : query.toLowerCase();
    return line => (options.caseSensitive ? line : line.toLowerCase()).includes(needle);
}

function createRipgrepArgs(options: RipgrepOptions): string[] {
    const args = [
        '--json',
        '--line-number',
        '--color',
        'never',
        '--no-messages',
        '--hidden'
    ];

    if (!options.caseSensitive) {
        args.push('--ignore-case');
    }
    if (!options.useRegex) {
        args.push('--fixed-strings');
    }

    const includePattern = normalizeIncludeGlob(options.includePattern);
    if (includePattern) {
        args.push('--glob', includePattern);
    }

    for (const pattern of createRipgrepExcludeGlobs(options.excludePatterns)) {
        args.push('--glob', `!${pattern}`);
    }

    args.push('--regexp', options.query, '.');
    return args;
}

function appendRipgrepMatch(line: string, options: RipgrepOptions, matches: string[]): void {
    const trimmed = line.trim();
    if (!trimmed) {
        return;
    }

    let message: RipgrepMatchMessage;
    try {
        message = JSON.parse(trimmed) as RipgrepMatchMessage;
    } catch {
        return;
    }

    if (message.type !== 'match' || !message.data?.path?.text || typeof message.data.line_number !== 'number') {
        return;
    }

    const rawPath = message.data.path.text;
    const absolutePath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(options.searchRoot, rawPath);
    const relativePath = toPosixPath(path.relative(options.workspaceRoot, absolutePath));
    const lineText = (message.data.lines?.text ?? '').replace(/\r?\n$/, '').trimEnd();
    matches.push(`${relativePath}:${message.data.line_number}: ${lineText}`);
}

function normalizeIncludeGlob(pattern: string | undefined): string | undefined {
    const normalized = typeof pattern === 'string' ? toPosixPath(pattern.trim()) : '';
    if (!normalized) {
        return undefined;
    }

    return normalized.includes('/') ? normalized : `**/${normalized}`;
}

function createRipgrepExcludeGlobs(excludePatterns: string[]): string[] {
    return [
        ...DEFAULT_EXCLUDED_DIRECTORIES.flatMap(directory => [
            `${directory}/**`,
            `**/${directory}/**`
        ]),
        ...excludePatterns.flatMap(expandUserExcludePattern)
    ];
}

function expandUserExcludePattern(pattern: string): string[] {
    const normalized = toPosixPath(pattern.trim());
    if (!normalized) {
        return [];
    }
    if (normalized.includes('/') || hasGlobSyntax(normalized)) {
        return [normalized];
    }

    return [normalized, `**/${normalized}`, `**/${normalized}/**`];
}

function hasGlobSyntax(value: string): boolean {
    return /[*?[\]{}]/.test(value);
}
