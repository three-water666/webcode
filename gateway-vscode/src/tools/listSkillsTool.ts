import type { LocalTool } from './types';
import { jsonResult } from './result';

export const listSkillsTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'list_skills',
        description: 'List skills discovered in the current VS Code workspace. Use this before loading a skill so you know what is available.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    async execute(_args, context) {
        return jsonResult(await context.skillManager.listSkills(context.skillDirectories));
    }
};
