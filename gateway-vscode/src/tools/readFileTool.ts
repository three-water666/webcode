import * as fs from 'fs/promises';
import type { LocalTool } from './types';
import { textResult } from './result';
import { normalizeLineEndings, resolveWorkspacePath } from './filesystemUtils';

export const readFileTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'read_file',
        description: 'Read a UTF-8 text file inside the current VS Code workspace. Use head or tail to read only the first or last N lines.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Workspace-relative or absolute path to the file.' },
                head: { type: 'integer', minimum: 1, description: 'Optional number of lines to read from the start of the file.' },
                tail: { type: 'integer', minimum: 1, description: 'Optional number of lines to read from the end of the file.' }
            },
            required: ['path']
        },
        annotations: { readOnlyHint: true }
    },
    async execute(args, context) {
        const filePath = await resolveWorkspacePath(context.workspaceRoot, args.path);
        const content = normalizeLineEndings(await fs.readFile(filePath, 'utf8'));

        if (typeof args.head === 'number' && typeof args.tail === 'number') {
            throw new Error('Cannot specify both head and tail.');
        }

        if (typeof args.head === 'number') {
            return textResult(content.split('\n').slice(0, args.head).join('\n'));
        }

        if (typeof args.tail === 'number') {
            return textResult(content.split('\n').slice(-args.tail).join('\n'));
        }

        return textResult(content);
    }
};
