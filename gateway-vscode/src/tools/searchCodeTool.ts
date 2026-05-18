import * as fs from 'fs/promises';
import * as path from 'path';
import type { LocalTool } from './types';
import { textResult } from './result';
import {
    getNumberArg,
    getStringArrayArg,
    matchesPattern,
    normalizeLineEndings,
    resolveWorkspaceDirectory,
    toPosixPath,
    walkWorkspaceFiles
} from './filesystemUtils';

const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 2;

export const searchCodeTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'search_code',
        description: 'Search UTF-8 text content inside workspace files. Returns relative file paths with line numbers and matching lines.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', minLength: 1, description: 'Text or regular expression to search for.' },
                path: { type: 'string', description: 'Optional workspace directory to search. Defaults to ".".' },
                include: { type: 'string', description: 'Optional glob for files to include, for example "**/*.ts".' },
                case_sensitive: { type: 'boolean', description: 'Whether matching is case-sensitive. Default: false.', default: false },
                use_regex: { type: 'boolean', description: 'Treat query as a JavaScript regular expression. Default: false.', default: false },
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
        const caseSensitive = args.case_sensitive === true;
        const matcher = createMatcher(query, { caseSensitive, useRegex: args.use_regex === true });
        const matches: string[] = [];

        await walkWorkspaceFiles(searchRoot, async (filePath, relativeToSearchRoot) => {
            if (typeof args.include === 'string' && args.include && !matchesPattern(relativeToSearchRoot, args.include) && !matchesPattern(path.basename(filePath), args.include)) {
                return false;
            }

            const stats = await fs.stat(filePath);
            if (stats.size > MAX_FILE_SIZE_BYTES) {
                return false;
            }

            const rawContent = await fs.readFile(filePath, 'utf8').catch(() => null);
            if (rawContent == null || rawContent.includes('\0')) {
                return false;
            }

            const lines = normalizeLineEndings(rawContent).split('\n');
            for (let index = 0; index < lines.length; index++) {
                if (!matcher(lines[index])) {
                    continue;
                }

                const relativePath = toPosixPath(path.relative(workspaceRoot, filePath));
                matches.push(`${relativePath}:${index + 1}: ${lines[index].trimEnd()}`);
                if (matches.length >= maxResults) {
                    return true;
                }
            }

            return false;
        }, {
            excludePatterns
        });

        return textResult(matches.length > 0 ? matches.join('\n') : 'No matches found.');
    }
};

function createMatcher(query: string, options: { caseSensitive: boolean; useRegex: boolean }): (line: string) => boolean {
    if (options.useRegex) {
        const flags = options.caseSensitive ? '' : 'i';
        const regex = new RegExp(query, flags);
        return line => regex.test(line);
    }

    const needle = options.caseSensitive ? query : query.toLowerCase();
    return line => (options.caseSensitive ? line : line.toLowerCase()).includes(needle);
}
