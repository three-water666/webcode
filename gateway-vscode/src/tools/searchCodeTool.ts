import { spawn } from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { LocalTool } from './types';
import { textResult } from './result';
import { getNumberArg, getStringArrayArg, resolveWorkspaceDirectory } from './filesystemUtils';
import { createSearchCodeFallbackNotice, searchCodeInProcess } from './searchCodeFallback';
import { appendRipgrepMatch } from './searchCodeRipgrepOutput';
import { getRipgrepBinaryName, getVSCodeRipgrepCandidates } from './searchCodeRipgrepPaths';
import {
    createRipgrepExcludeGlobs,
    DEFAULT_MATCH_LINE_MAX_CHARS,
    getBoundedSearchLineMaxChars,
    MAX_MATCH_LINE_MAX_CHARS,
    MIN_MATCH_LINE_MAX_CHARS,
    normalizeIncludeGlob,
} from './searchCodeUtils';
import type { SearchCodeOptions } from './searchCodeTypes';

export const searchCodeTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'search_code',
        description: [
            'Search text content inside workspace files using ripgrep.',
            'Returns relative file paths with line numbers and matching lines.'
        ].join(' '),
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', minLength: 1, description: 'Text or ripgrep regular expression to search for.' },
                path: { type: 'string', description: 'Optional workspace directory to search. Defaults to ".".' },
                include: { type: 'string', description: 'Optional glob for files to include, for example "**/*.ts".' },
                case_sensitive: { type: 'boolean', description: 'Whether matching is case-sensitive. Default: false.', default: false },
                use_regex: { type: 'boolean', description: 'Treat query as a ripgrep regular expression. Default: false.', default: false },
                max_results: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 500,
                    description: 'Maximum matching lines to return. Default: 100.',
                    default: 100
                },
                max_line_chars: {
                    type: 'integer',
                    minimum: MIN_MATCH_LINE_MAX_CHARS,
                    maximum: MAX_MATCH_LINE_MAX_CHARS,
                    description: [
                        'Maximum characters to return from each matching line.',
                        'Long lines are cropped around the match. Default: 500.'
                    ].join(' '),
                    default: DEFAULT_MATCH_LINE_MAX_CHARS
                },
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
            useRegex: args.use_regex === true,
            matchLineMaxChars: getBoundedSearchLineMaxChars(args.max_line_chars)
        };
        const matches = await runRipgrepWithFallback(options, context.outputChannel);

        return textResult(matches.length > 0 ? matches.join('\n') : 'No matches found.');
    }
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

async function runRipgrepWithFallback(
    options: SearchCodeOptions,
    outputChannel: vscode.OutputChannel
): Promise<string[]> {
    try {
        return await runRipgrep(options);
    } catch (error) {
        if (error instanceof RipgrepUnavailableError) {
            logRipgrepFallback(outputChannel, error);
            const matches = await searchCodeInProcess(options);
            return [
                createSearchCodeFallbackNotice(),
                ...(matches.length > 0 ? matches : ['No matches found.'])
            ];
        }

        throw error;
    }
}

function logRipgrepFallback(outputChannel: vscode.OutputChannel, error: RipgrepUnavailableError): void {
    outputChannel.appendLine('[search_code] ripgrep unavailable; using in-process fallback.');
    for (const line of error.message.split('\n')) {
        outputChannel.appendLine(`[search_code] ${line}`);
    }
}

async function runRipgrep(options: SearchCodeOptions): Promise<string[]> {
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

    const vscodeRipgrepCandidates = getVSCodeRipgrepCandidates(
        vscode.env.appRoot,
        process.env.PATH,
        process.platform,
        process.arch
    );

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

function getConfiguredRipgrepPath(): string | undefined {
    const configuredPath = vscode.workspace
        .getConfiguration('webcodeGateway')
        .get<string>('ripgrep.path', '')
        .trim();
    return configuredPath || undefined;
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

function createRipgrepArgs(options: SearchCodeOptions): string[] {
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
