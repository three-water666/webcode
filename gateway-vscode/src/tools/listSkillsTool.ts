import type { LocalTool } from './types';
import { jsonResult } from './result';

export const listSkillsTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'list_skills',
        description: 'List skills discovered in the current VS Code workspace, including the direct SKILL.md path for each skill.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    async execute(_args, context) {
        return jsonResult(await context.skillManager.listSkills(context.skillDirectories));
    }
};
