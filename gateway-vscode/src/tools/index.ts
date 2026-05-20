import type { LocalTool } from './types';
import { editFileTool } from './editFileTool';
import { executeCommandTool } from './executeCommandTool';
import { getProjectRulesTool } from './getProjectRulesTool';
import { getSkillTool } from './getSkillTool';
import { listSkillsTool } from './listSkillsTool';
import { listToolsTool } from './listToolsTool';
import { readFileTool } from './readFileTool';
import { runInTerminalTool } from './runInTerminalTool';
import { searchCodeTool } from './searchCodeTool';
import { searchFilesTool } from './searchFilesTool';
import { terminalSessionTool } from './terminalSessionTool';
import { writeFileTool } from './writeFileTool';

const LOCAL_TOOLS: LocalTool[] = [
    listToolsTool,
    getProjectRulesTool,
    readFileTool,
    writeFileTool,
    editFileTool,
    searchFilesTool,
    searchCodeTool,
    executeCommandTool,
    runInTerminalTool,
    terminalSessionTool,
    listSkillsTool,
    getSkillTool
];

export function createLocalToolMap(): Map<string, LocalTool> {
    return new Map(LOCAL_TOOLS.map(tool => [tool.definition.name, tool]));
}

export type {
    LocalTool,
    ToolDefinition,
    ToolExecutionContext,
    ToolResult
} from './types';
