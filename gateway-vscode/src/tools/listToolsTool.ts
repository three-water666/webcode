import type { LocalTool } from './types';
import { jsonResult } from './result';

export const listToolsTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'list_tools',
        description: 'List the tools available through webcode, grouped by server.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    execute(_args, context) {
        return Promise.resolve(jsonResult(context.listTools()));
    }
};
