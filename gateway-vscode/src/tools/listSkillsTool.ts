import type { LocalTool } from './types';
import { jsonResult } from './result';

export const listSkillsTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'list_skills',
        description: 'List workspace and built-in skills available to webcode, including the read_file path for each SKILL.md.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    async execute(_args, context) {
        return jsonResult(await context.skillManager.listSkills(context.skillDirectories));
    }
};
