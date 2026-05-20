import type { LocalTool } from './types';
import { textResult } from './result';
import { atomicWriteFile, resolveWorkspacePath } from './filesystemUtils';

export const writeFileTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'write_file',
        description: 'Create or completely overwrite a UTF-8 text file inside the current VS Code workspace. ' +
            'If prior read_file output included line numbers such as "12: code", do not include those line number prefixes in the written content.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Workspace-relative or absolute path to the file.' },
                content: {
                    type: 'string',
                    description: 'Complete file content to write. Do not include read_file line number prefixes as file content.'
                }
            },
            required: ['path', 'content']
        },
        annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: true }
    },
    async execute(args, context) {
        const filePath = await resolveWorkspacePath(context.workspaceRoot, args.path, { forWrite: true });
        await atomicWriteFile(filePath, String(args.content));
        return textResult(`Successfully wrote ${String(args.path)}`);
    }
};
