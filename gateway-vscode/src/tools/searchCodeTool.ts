import { spawn } from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import type { LocalTool } from './types';
import { textResult } from './result';
import {
    DEFAULT_EXCLUDED_DIRECTORIES,
    getNumberArg,
    getStringArrayArg,
    resolveWorkspaceDirectory,
    toPosixPath
} from './filesystemUtils';

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
        const matches = await runRipgrep({
            searchRoot,
            workspaceRoot,
            query,
            maxResults,
            includePattern: typeof args.include === 'string' ? args.include : undefined,
            excludePatterns,
            caseSensitive: args.case_sensitive === true,
            useRegex: args.use_regex === true
        });

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

const nodeRequire = createRequire(__filename);

async function runRipgrep(options: RipgrepOptions): Promise<string[]> {
    const rgPath = resolveRipgrepPath();
    const args = createRipgrepArgs(options);
    const matches: string[] = [];
    let limitReached = false;
    let stdoutBuffer = '';
    let stderr = '';

    return new Promise((resolve, reject) => {
        const child = spawn(rgPath, args, {
            cwd: options.searchRoot,
            windowsHide: true
        });

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

        child.on('error', reject);
        child.on('close', code => {
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

function resolveRipgrepPath(): string {
    const bundledPath = path.join(__dirname, 'bin', process.platform === 'win32' ? 'rg.exe' : 'rg');
    if (fs.existsSync(bundledPath)) {
        return bundledPath;
    }

    const arch = process.env.npm_config_arch || process.arch;
    const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const platformPackage = `@vscode/ripgrep-${process.platform}-${arch}`;

    try {
        const ripgrepMain = nodeRequire.resolve('@vscode/ripgrep');
        return createRequire(ripgrepMain).resolve(`${platformPackage}/bin/${binaryName}`);
    } catch {
        try {
            return nodeRequire.resolve(`${platformPackage}/bin/${binaryName}`);
        } catch {
            throw new Error(
                `Could not find ${platformPackage}. ` +
                `Ensure @vscode/ripgrep optional dependencies are installed for this platform (${process.platform}-${arch}).`
            );
        }
    }
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
