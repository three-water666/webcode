import * as path from 'path';
import * as vscode from 'vscode';
import type { LocalTool } from './types';
import { textResult } from './result';
import {
    DEFAULT_EXCLUDED_DIRECTORIES,
    getNumberArg,
    getStringArrayArg,
    matchesAnyPattern,
    matchesFileQuery,
    resolveWorkspaceDirectory,
    toPosixPath
} from './filesystemUtils';

export const searchFilesTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'search_files',
        description: 'Search file names and relative paths inside the current VS Code workspace. Use this to find a file before reading or editing it.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', minLength: 1, description: 'Filename substring or glob pattern, for example "gateway.ts" or "**/*.test.ts".' },
                path: { type: 'string', description: 'Optional workspace directory to search. Defaults to ".".' },
                max_results: { type: 'integer', minimum: 1, maximum: 500, description: 'Maximum matches to return. Default: 200.', default: 200 },
                exclude_patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to exclude.' }
            },
            required: ['query']
        },
        annotations: { readOnlyHint: true }
    },
    async execute(args, context) {
        const searchRoot = await resolveWorkspaceDirectory(context.workspaceRoot, args.path ?? '.');
        const workspaceRoot = context.workspaceRoot ?? searchRoot;
        const query = toPosixPath(String(args.query).trim());
        const maxResults = getNumberArg(args.max_results, 200);
        const excludePatterns = getStringArrayArg(args.exclude_patterns);
        const includePattern = createFileSearchIncludePattern(query);
        const excludePattern = createFindFilesExcludePattern(excludePatterns);
        const uris = await vscode.workspace.findFiles(
            new vscode.RelativePattern(searchRoot, includePattern),
            excludePattern ? new vscode.RelativePattern(searchRoot, excludePattern) : undefined,
            maxResults
        );

        const matches: string[] = [];
        for (const uri of uris.sort((left, right) => left.fsPath.localeCompare(right.fsPath))) {
            const filePath = uri.fsPath;
            const relativeToSearchRoot = toPosixPath(path.relative(searchRoot, filePath));
            const relativeToWorkspace = toPosixPath(path.relative(workspaceRoot, filePath));
            const fileName = path.basename(filePath);
            if (
                matchesAnyPattern(relativeToSearchRoot, excludePatterns) ||
                matchesAnyPattern(relativeToWorkspace, excludePatterns) ||
                !matchesFileQuery(relativeToSearchRoot, fileName, query)
            ) {
                continue;
            }

            matches.push(relativeToWorkspace);
            if (matches.length >= maxResults) {
                break;
            }
        }

        return textResult(matches.length > 0 ? matches.join('\n') : 'No matches found.');
    }
};

function createFileSearchIncludePattern(query: string): string {
    if (hasGlobSyntax(query)) {
        return query.includes('/') ? query : `**/${query}`;
    }

    return query.includes('/') ? '**/*' : `**/*${query}*`;
}

function createFindFilesExcludePattern(excludePatterns: string[]): string | undefined {
    const patterns = [
        ...DEFAULT_EXCLUDED_DIRECTORIES.map(directory => `**/${directory}/**`),
        ...excludePatterns.map(pattern => toPosixPath(pattern.trim())).filter(Boolean)
    ];

    if (patterns.length === 0) {
        return undefined;
    }
    if (patterns.length === 1) {
        return patterns[0];
    }

    return `{${patterns.join(',')}}`;
}

function hasGlobSyntax(value: string): boolean {
    return /[*?[\]{}]/.test(value);
}
