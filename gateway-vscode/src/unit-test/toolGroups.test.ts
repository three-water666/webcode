import * as assert from 'assert';

import { generateGroupedTools } from '../gateway/toolGroups';
import type { LocalTool } from '../tools';

suite('Gateway tool grouping', () => {
    test('hides bootstrap-only tools from model-visible tool groups', () => {
        const groups = generateGroupedTools(new Map(), new Map([
            ['list_tools', createLocalTool('list_tools')],
            ['get_project_rules', createLocalTool('get_project_rules')],
            ['get_project_context', createLocalTool('get_project_context')],
            ['list_skills', createLocalTool('list_skills')],
            ['read_file', createLocalTool('read_file')]
        ]));

        const internalGroup = groups.find(group => group.server === 'internal');
        assert.ok(internalGroup);
        assert.deepStrictEqual(
            internalGroup.tools.map(tool => tool.name),
            ['read_file']
        );
    });
});

function createLocalTool(name: string): LocalTool {
    return {
        definition: {
            name,
            description: `${name} description`,
            inputSchema: { type: 'object', properties: {} }
        },
        serverId: 'internal',
        execute() {
            return Promise.resolve({ content: [] });
        }
    };
}
