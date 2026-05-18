import * as path from 'path';
import type { LocalTool } from './types';
import { errorResult, jsonResult } from './result';
import {
    describeShellCommandPolicy,
    normalizeShellCommand,
    resolveShellExecutionPlan
} from '../servers/commandShell';
import { assertShellCommandRiskAllowed } from '../servers/commandRisk';

export const runInTerminalTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'run_in_terminal',
        description: 'Start a long-running POSIX/bash command in a visible VS Code terminal session. Returns a session_id immediately; use terminal_session to inspect output, check status, or stop it later.',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', minLength: 1, description: 'POSIX/bash command to execute.' },
                cwd: { type: 'string', description: 'Optional working directory inside the workspace. Defaults to the workspace root.' },
                auto_focus: { type: 'boolean', description: 'Focus the terminal after sending the command. Default: true.', default: true }
            },
            required: ['command']
        }
    },
    async execute(args, context) {
        if (!context.workspaceRoot) {
            return errorResult('Security Error: A VS Code workspace folder is required to run terminal commands.');
        }

        try {
            const commandLine = normalizeShellCommand(args.command);
            assertShellCommandRiskAllowed(commandLine);
            const execution = resolveShellExecutionPlan(commandLine, {
                platform: process.platform,
                env: process.env,
                configuredPath: context.commandShellPath
            });
            const cwd = resolveWorkspaceCwd(context.workspaceRoot, args.cwd);
            const session = context.terminalSessionManager.createSession({
                commandLine,
                file: execution.file,
                args: execution.args,
                cwd,
                env: { ...process.env },
                autoFocus: args.auto_focus !== false
            });

            return jsonResult({
                session_id: session.id,
                name: session.name,
                status: session.status,
                cwd: session.cwd,
                command: session.command,
                shell: {
                    id: execution.shell.id,
                    path: execution.shell.path
                }
            });
        } catch (error: any) {
            return errorResult(`Error: ${error.message}\nPolicy: ${describeShellCommandPolicy(process.platform)}`);
        }
    }
};

function resolveWorkspaceCwd(workspaceRoot: string, requestedCwd: unknown): string {
    if (requestedCwd == null || requestedCwd === '') {
        return workspaceRoot;
    }
    if (typeof requestedCwd !== 'string') {
        throw new Error('cwd must be a string.');
    }

    const resolved = path.isAbsolute(requestedCwd)
        ? path.normalize(requestedCwd)
        : path.resolve(workspaceRoot, requestedCwd);
    const relative = path.relative(workspaceRoot, resolved);
    const isSubPath = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));

    if (!isSubPath) {
        throw new Error(`Permission denied: cwd must stay inside the workspace (${workspaceRoot}).`);
    }

    return resolved;
}
