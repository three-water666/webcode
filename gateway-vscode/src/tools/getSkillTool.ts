import type { LocalTool } from './types';
import { jsonResult } from './result';

export const getSkillTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'get_skill',
        description: [
            'Load a workspace skill. Omit resource_path to read SKILL.md and the resource list;',
            'include resource_path to read a text resource inside the skill directory.',
            'Prefer passing skill_id from the Available Skills initialization list.'
        ].join(' '),
        inputSchema: {
            type: 'object',
            properties: {
                skill_id: { type: 'string', description: 'Stable skill identifier from the Available Skills initialization list.' },
                skill_name: { type: 'string', description: 'Fallback skill name when skill_id is unavailable.' },
                resource_path: {
                    type: 'string',
                    minLength: 1,
                    description: 'Optional path relative to the skill directory. When provided, reads that resource instead of SKILL.md.'
                }
            },
            anyOf: [
                { required: ['skill_id'], properties: { skill_id: {}, skill_name: {}, resource_path: {} } },
                { required: ['skill_name'], properties: { skill_id: {}, skill_name: {}, resource_path: {} } }
            ]
        }
    },
    async execute(args, context) {
        const params = {
            skill_id: typeof args.skill_id === 'string' ? args.skill_id : undefined,
            skill_name: typeof args.skill_name === 'string' ? args.skill_name : undefined
        };

        if (typeof args.resource_path === 'string') {
            return jsonResult(await context.skillManager.getSkillResource({
                ...params,
                resource_path: args.resource_path
            }, context.skillDirectories));
        }

        return jsonResult(await context.skillManager.getSkillDetails(params, context.skillDirectories));
    }
};
