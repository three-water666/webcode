import { spawn } from 'child_process';
import * as path from 'path';
import type * as vscode from 'vscode';
import type { LocalTool } from './types';
import { textResult } from './result';
import {
    DEFAULT_EXCLUDED_DIRECTORIES,
    type FileQueryMatchMode,
    getNumberArg,
    getStringArrayArg,
    matchesAnyPattern,
    matchesFileQuery,
    resolveFileQueryMatchMode,
    resolveWorkspaceDirectory,
    toPosixPath,
    walkWorkspaceFiles
} from './filesystemUtils';
import { createRipgrepStartError, resolveRipgrepCommand, RipgrepUnavailableError } from './ripgrep';
import { listGitSearchFiles } from './searchCodeGitFiles';
import { createRipgrepExcludeGlobs } from './searchCodeUtils';
import { createRipgrepFilesArgs } from './searchFilesRipgrepArgs';
import { formatSearchResultsLimitedNotice } from './searchResultLimits';

const DEFAULT_EXCLUDED_DIRECTORY_NAMES = DEFAULT_EXCLUDED_DIRECTORIES.join(', ');

export const searchFilesTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'search_files',
        description: 'Search file names and relative paths inside the current VS Code workspace, ordered by path. Use this to find a file before reading or editing it.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', minLength: 1, description: 'Filename/path substring or glob pattern. Default: "*", which lists files under path.' },
                path: { type: 'string', description: 'Optional workspace directory to search. Defaults to ".".' },
                match: {
                    type: 'string',
                    enum: ['auto', 'substring', 'glob'],
                    description: 'How to interpret query. auto treats * ? { } as glob syntax and everything else as a substring. Default: auto.',
                    default: 'auto'
                },
                case_sensitive: { type: 'boolean', description: 'Whether matching is case-sensitive. Default: false.', default: false },
                max_results: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 500,
                    description: 'Maximum matches to return. If this limit is reached, output includes a limited-results notice. Default: 200.',
                    default: 200
                },
                exclude_patterns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: [
                        'Additional glob patterns to exclude, merged with the default excluded directory names.',
                        `Default excluded directory names: ${DEFAULT_EXCLUDED_DIRECTORY_NAMES}.`,
                        'Patterns are matched against paths under the search root; bare names match anywhere.',
                        'search_files uses ripgrep default ignore behavior, so .gitignore/.ignore may also exclude files.'
                    ].join(' ')
                }
            }
        },
        annotations: { readOnlyHint: true }
    },
    async execute(args, context) {
        const searchRoot = await resolveWorkspaceDirectory(context.workspaceRoot, args.path ?? '.');
        const workspaceRoot = context.workspaceRoot ?? searchRoot;
        const options: SearchFilesOptions = {
            searchRoot,
            workspaceRoot,
            query: normalizeSearchFilesQuery(args.query),
            matchMode: getSearchFilesMatchMode(args.match),
            caseSensitive: args.case_sensitive === true,
            maxResults: getNumberArg(args.max_results, 200),
            excludePatterns: getStringArrayArg(args.exclude_patterns)
        };
        const result = await searchFilePathsWithFallback(options, context.outputChannel);

        return textResult(formatSearchFilesOutput(result, options));
    }
};

type SearchFilesOptions = {
    searchRoot: string;
    workspaceRoot: string;
    query: string;
    matchMode: FileQueryMatchMode;
    caseSensitive: boolean;
    maxResults: number;
    excludePatterns: string[];
};

type SearchFilesResult = {
    matches: string[];
    limited: boolean;
};

function formatSearchFilesOutput(result: SearchFilesResult, options: SearchFilesOptions): string {
    if (result.matches.length === 0) {
        return formatNoMatchesMessage(options);
    }

    const lines = [...result.matches];
    if (result.limited) {
        lines.push(formatSearchResultsLimitedNotice(
            'search_files',
            options.maxResults,
            'file(s)',
            'Narrow query/path/exclude_patterns or raise max_results.'
        ));
    }

    return lines.join('\n');
}

async function searchFilePathsWithFallback(
    options: SearchFilesOptions,
    outputChannel: vscode.OutputChannel
): Promise<SearchFilesResult> {
    try {
        return await runRipgrepFiles(options);
    } catch (error) {
        if (!(error instanceof RipgrepUnavailableError)) {
            throw error;
        }

        outputChannel.appendLine('[search_files] ripgrep unavailable; using git/file walker fallback.');
        for (const line of error.message.split('\n')) {
            outputChannel.appendLine(`[search_files] ${line}`);
        }
        return searchFilesInProcess(options);
    }
}

async function runRipgrepFiles(options: SearchFilesOptions): Promise<SearchFilesResult> {
    const rgCommand = resolveRipgrepCommand();
    const args = createRipgrepFilesArgs(options.excludePatterns);
    const matches: string[] = [];
    let stdoutBuffer = '';
    let stderr = '';
    let limitReached = false;

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
                appendFileSearchMatch(line, options, matches);

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
            if (stdoutBuffer.length > 0 && matches.length < options.maxResults) {
                appendFileSearchMatch(stdoutBuffer, options, matches);
            }

            if (code === 0 || code === 1 || limitReached) {
                resolve({
                    matches: matches.slice(0, options.maxResults),
                    limited: limitReached
                });
                return;
            }

            reject(new Error(`search_files failed: ${stderr.trim() || `ripgrep exited with code ${code ?? 'unknown'}`}`));
        });
    });
}

async function searchFilesInProcess(options: SearchFilesOptions): Promise<SearchFilesResult> {
    const gitFiles = await listGitSearchFiles(options.searchRoot);
    if (gitFiles) {
        const excludePatterns = createRipgrepExcludeGlobs(options.excludePatterns);
        const matches: string[] = [];
        for (const candidate of gitFiles) {
            if (matchesAnyPattern(candidate.relativeToSearchRoot, excludePatterns)) {
                continue;
            }

            appendWorkspaceFileSearchMatch(
                candidate.filePath,
                candidate.relativeToSearchRoot,
                options,
                matches
            );
        }

        return limitSortedFileMatches(matches, options.maxResults);
    }

    const matches: string[] = [];
    await walkWorkspaceFiles(options.searchRoot, (filePath, relativeToSearchRoot) => {
        appendWorkspaceFileSearchMatch(filePath, relativeToSearchRoot, options, matches);
        return Promise.resolve(false);
    }, {
        excludePatterns: options.excludePatterns
    });

    return limitSortedFileMatches(matches, options.maxResults);
}

function limitSortedFileMatches(matches: string[], maxResults: number): SearchFilesResult {
    const sortedMatches = matches.sort((left, right) => left.localeCompare(right));
    return {
        matches: sortedMatches.slice(0, maxResults),
        limited: sortedMatches.length > maxResults
    };
}

function appendFileSearchMatch(line: string, options: SearchFilesOptions, matches: string[]): void {
    const relativeToSearchRoot = toPosixPath(line.replace(/\r$/, ''));
    if (!relativeToSearchRoot) {
        return;
    }

    appendWorkspaceFileSearchMatch(
        path.resolve(options.searchRoot, relativeToSearchRoot),
        relativeToSearchRoot,
        options,
        matches
    );
}

function appendWorkspaceFileSearchMatch(
    filePath: string,
    relativeToSearchRoot: string,
    options: SearchFilesOptions,
    matches: string[]
): void {
    const relativeToWorkspace = toPosixPath(path.relative(options.workspaceRoot, filePath));
    const fileName = getPosixBasename(relativeToSearchRoot);
    if (
        matchesAnyPattern(relativeToSearchRoot, options.excludePatterns) ||
        matchesAnyPattern(relativeToWorkspace, options.excludePatterns) ||
        !matchesFileQuery(relativeToSearchRoot, fileName, options.query, {
            caseSensitive: options.caseSensitive,
            matchMode: options.matchMode
        })
    ) {
        return;
    }

    matches.push(relativeToWorkspace);
}

function normalizeSearchFilesQuery(value: unknown): string {
    if (typeof value !== 'string') {
        return '*';
    }

    const query = toPosixPath(value.trim());
    return query || '*';
}

function getSearchFilesMatchMode(value: unknown): FileQueryMatchMode {
    return value === 'substring' || value === 'glob' ? value : 'auto';
}

function getPosixBasename(value: string): string {
    const parts = toPosixPath(value).split('/');
    return parts[parts.length - 1] ?? value;
}

function formatNoMatchesMessage(options: SearchFilesOptions): string {
    const effectiveMatchMode = resolveFileQueryMatchMode(options.query, options.matchMode);
    const lines = [
        'No matches found.',
        `Searched path: ${formatSearchRoot(options)}`,
        `Query: ${options.query}`,
        `Match: ${options.matchMode}${options.matchMode === 'auto' ? ` (${effectiveMatchMode})` : ''}`,
        `Case sensitive: ${options.caseSensitive}`
    ];

    if (options.query === '.') {
        lines.push('Hint: query "." matches a literal dot. Use query "*" to list files.');
    }
    if (options.query.includes('|')) {
        lines.push('Hint: "|" is treated literally. Use glob braces like "*{foo,bar}*" for simple alternatives.');
    }

    return lines.join('\n');
}

function formatSearchRoot(options: SearchFilesOptions): string {
    const relative = toPosixPath(path.relative(options.workspaceRoot, options.searchRoot));
    return relative || '.';
}
