import * as path from 'path';
import type { LocalTool } from './types';
import { textResult } from './result';
import {
    getNumberArg,
    getStringArrayArg,
    matchesFileQuery,
    resolveWorkspaceDirectory,
    toPosixPath,
    walkWorkspaceFiles
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
        const query = String(args.query);
        const maxResults = getNumberArg(args.max_results, 200);
        const excludePatterns = getStringArrayArg(args.exclude_patterns);
        const matches: string[] = [];

        await walkWorkspaceFiles(searchRoot, async (filePath, relativeToSearchRoot) => {
            const fileName = path.basename(filePath);
            if (!matchesFileQuery(relativeToSearchRoot, fileName, query)) {
                return false;
            }

            matches.push(toPosixPath(path.relative(workspaceRoot, filePath)));
            return matches.length >= maxResults;
        }, {
            excludePatterns
        });

        return textResult(matches.length > 0 ? matches.join('\n') : 'No matches found.');
    }
};
