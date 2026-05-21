import type { LocalTool, ToolDefinition } from '../tools';
import type { RemoteToolRoute } from './types';

type GroupedToolDefinition = ToolDefinition & {
    _server?: string;
};

type ToolGroup = {
    tools: ToolDefinition[];
};

export function generateGroupedTools(
    toolRouter: Map<string, RemoteToolRoute>,
    localTools: Map<string, LocalTool>
) {
    const allTools = Array.from(toolRouter.values()).map(t => ({ ...t.definition, _server: t.serverId }));

    for (const tool of localTools.values()) {
        allTools.push({ ...tool.definition, _server: tool.serverId ?? 'internal' });
    }

    const groups: Record<string, ToolGroup> = {};

    allTools.forEach((tool: GroupedToolDefinition) => {
        const server = tool._server ?? 'unknown';
        if (!groups[server]) {
            groups[server] = { tools: [] };
        }

        const { _server, ...cleanTool } = tool;
        groups[server].tools.push(cleanTool);
    });

    return Object.entries(groups).map(([server, data]) => ({
        server,
        tools: data.tools.sort((a, b) => a.name.localeCompare(b.name))
    }));
}
