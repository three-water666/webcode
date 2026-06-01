import { spawn } from 'child_process';
import type * as vscode from 'vscode';
import type { LocalTool } from './types';
import { textResult } from './result';
import { DEFAULT_EXCLUDED_DIRECTORIES, getNumberArg, getStringArrayArg, resolveWorkspaceDirectory } from './filesystemUtils';
import { createSearchCodeFallbackNotice, searchCodeInProcess } from './searchCodeFallback';
import { appendRipgrepMatch } from './searchCodeRipgrepOutput';
import { createRipgrepStartError, resolveRipgrepCommand, RipgrepUnavailableError } from './ripgrep';
import { formatSearchResultsLimitedNotice } from './searchResultLimits';
import { createSearchCodeRipgrepArgs } from './searchCodeRipgrepArgs';
import {
    DEFAULT_MATCH_LINE_MAX_CHARS,
    getBoundedSearchLineMaxChars,
    getSearchCodeMatchMode,
    looksLikeRegexQuery,
    MAX_MATCH_LINE_MAX_CHARS,
    MIN_MATCH_LINE_MAX_CHARS,
} from './searchCodeUtils';
import type { SearchCodeOptions } from './searchCodeTypes';

const DEFAULT_EXCLUDED_DIRECTORY_NAMES = DEFAULT_EXCLUDED_DIRECTORIES.join(', ');

export const searchCodeTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'search_code',
        description: [
            'Search text content inside workspace files using ripgrep.',
            'Returns relative file paths with line numbers and matching lines, ordered by path and line number.'
        ].join(' '),
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    minLength: 1,
                    description: [
                        'Text to search for.',
                        'match "substring" searches for a literal contained substring.',
                        'match "regex" treats this as a ripgrep regular expression.',
                        'When using regex syntax such as |, .*, groups, character classes, or \\b, set match to "regex".'
                    ].join(' ')
                },
                path: { type: 'string', description: 'Optional workspace directory to search. Defaults to ".".' },
                include: { type: 'string', description: 'Optional glob for files to include, for example "**/*.ts".' },
                case_sensitive: { type: 'boolean', description: 'Whether matching is case-sensitive. Default: false.', default: false },
                match: {
                    type: 'string',
                    enum: ['substring', 'regex'],
                    description: [
                        'How to interpret query.',
                        '"substring" is a literal contained substring and treats regex metacharacters as plain text.',
                        '"regex" is a ripgrep regular expression; use it for |, .*, groups, character classes, or \\b.',
                        'Default: substring.'
                    ].join(' '),
                    default: 'substring'
                },
                max_results: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 500,
                    description: 'Maximum matching lines to return. If this limit is reached, output includes a limited-results notice. Default: 100.',
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
                exclude_patterns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: [
                        'Additional glob patterns to exclude, merged with the default excluded directory names.',
                        `Default excluded directory names: ${DEFAULT_EXCLUDED_DIRECTORY_NAMES}.`,
                        'Patterns are matched against paths under the search root; bare names match anywhere.',
                        'search_code uses ripgrep default ignore behavior, so .gitignore/.ignore may also exclude files.'
                    ].join(' ')
                }
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
            useRegex: getSearchCodeMatchMode(args.match) === 'regex',
            matchLineMaxChars: getBoundedSearchLineMaxChars(args.max_line_chars)
        };
        const result = await runRipgrepWithFallback(options, context.outputChannel);

        return textResult(formatSearchCodeOutput(result, options));
    }
};

type SearchCodeResult = {
    matches: string[];
    limited: boolean;
    notices?: string[];
};

function formatSearchCodeOutput(result: SearchCodeResult, options: SearchCodeOptions): string {
    const lines = [...(result.notices ?? [])];
    if (result.matches.length === 0) {
        lines.push(...createNoMatchesOutput(options).split('\n'));
        return lines.join('\n');
    }

    lines.push(...result.matches);
    if (result.limited) {
        lines.push(formatSearchResultsLimitedNotice(
            'search_code',
            options.maxResults,
            'match(es)',
            'Narrow query/path/include/exclude_patterns or raise max_results.'
        ));
    }

    return lines.join('\n');
}

function createNoMatchesOutput(options: SearchCodeOptions): string {
    const lines = ['No matches found.'];
    if (!options.useRegex && looksLikeRegexQuery(options.query)) {
        lines.push('Hint: query looks like a regular expression. Did you mean to set match: "regex"?');
    }

    return lines.join('\n');
}

async function runRipgrepWithFallback(
    options: SearchCodeOptions,
    outputChannel: vscode.OutputChannel
): Promise<SearchCodeResult> {
    try {
        return await runRipgrep(options);
    } catch (error) {
        if (error instanceof RipgrepUnavailableError) {
            logRipgrepFallback(outputChannel, error);
            const result = await searchCodeInProcess(options);
            return {
                ...result,
                notices: createSearchCodeFallbackNotice().split('\n')
            };
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

async function runRipgrep(options: SearchCodeOptions): Promise<SearchCodeResult> {
    const rgCommand = resolveRipgrepCommand();
    const args = createSearchCodeRipgrepArgs(options);
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
                resolve({
                    matches: matches.slice(0, options.maxResults),
                    limited: limitReached
                });
                return;
            }

            reject(new Error(`search_code failed: ${stderr.trim() || `ripgrep exited with code ${code ?? 'unknown'}`}`));
        });
    });
}
