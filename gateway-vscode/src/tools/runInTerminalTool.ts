import type { LocalTool, ToolDefinition } from './types';
import { errorResult, jsonResult } from './result';
import { resolveWorkspaceDirectory } from './filesystemUtils';
import { normalizeShellCommand } from '../servers/commandShell';
import { assertTerminalCommandRiskAllowed } from '../servers/terminalCommandRisk';
import {
    describeTerminalProfiles,
    listTerminalProfiles,
    resolveTerminalProfile
} from '../servers/terminalProfiles';
import { getErrorMessage } from '../gateway/errorUtils';

export const runInTerminalTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'run_in_terminal',
        description: 'Run a command in a real visible VS Code integrated terminal.',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', minLength: 1, description: 'Command to execute using the selected terminal profile syntax.' },
                cwd: { type: 'string', description: 'Optional working directory inside the workspace. Defaults to the workspace root.' },
                profile: { type: 'string', description: 'Terminal profile id to use. Dynamic tool descriptions list available profiles.' },
                auto_focus: { type: 'boolean', description: 'Focus the terminal after sending the command. Default: true.', default: true }
            },
            required: ['command']
        }
    },
    getDefinition(context) {
        return createRunInTerminalDefinition(context.commandShellPath);
    },
    async execute(args, context) {
        if (!context.workspaceRoot) {
            return errorResult('Security Error: A VS Code workspace folder is required to run terminal commands.');
        }

        try {
            const commandLine = normalizeShellCommand(args.command);
            const profile = resolveTerminalProfile(args.profile, {
                platform: process.platform,
                env: process.env,
                configuredCommandShellPath: context.commandShellPath
            });
            assertTerminalCommandRiskAllowed(commandLine, profile.shellKind);
            const cwdArg = typeof args.cwd === 'string' && args.cwd.trim() === '' ? '.' : args.cwd ?? '.';
            const cwd = await resolveWorkspaceDirectory(context.workspaceRoot, cwdArg);
            const session = context.terminalSessionManager.createSession({
                commandLine,
                cwd,
                env: { ...process.env },
                profile,
                autoFocus: args.auto_focus !== false
            });

            return jsonResult({
                session_id: session.id,
                name: session.name,
                status: session.status,
                cwd: session.cwd,
                command: session.command,
                profile: session.profile,
                shell: {
                    id: profile.id,
                    syntax: profile.syntax
                }
            });
        } catch (error: unknown) {
            return errorResult(`Error: ${getErrorMessage(error)}\n${describeRunInTerminalPolicy(context.commandShellPath)}`);
        }
    }
};

function createRunInTerminalDefinition(commandShellPath?: string): ToolDefinition {
    const profiles = listTerminalProfiles({
        platform: process.platform,
        env: process.env,
        configuredCommandShellPath: commandShellPath
    });
    const profileIds = profiles.map(profile => profile.id).join(', ') || 'none';
    const defaultProfile = profiles[0]?.id;

    return {
        name: 'run_in_terminal',
        description: [
            'Run a command in a real visible VS Code integrated terminal.',
            'Returns a session_id immediately; use terminal_session to read captured output or interrupt it later.',
            'Command output and exit codes are captured when VS Code shell integration is available.',
            'Use Git Bash/POSIX syntax with git-bash, and PowerShell syntax with pwsh or powershell.',
            'Available terminal profiles:',
            describeTerminalProfiles(profiles)
        ].join('\n'),
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', minLength: 1, description: 'Command to execute using the selected terminal profile syntax.' },
                cwd: { type: 'string', description: 'Optional working directory inside the workspace. Defaults to the workspace root.' },
                profile: {
                    type: 'string',
                    description: `Terminal profile id to use. Available now: ${profileIds}. Default: ${defaultProfile ?? 'none'}.`
                },
                auto_focus: { type: 'boolean', description: 'Focus the terminal after sending the command. Default: true.', default: true }
            },
            required: ['command']
        }
    };
}

function describeRunInTerminalPolicy(commandShellPath?: string): string {
    const profiles = listTerminalProfiles({
        platform: process.platform,
        env: process.env,
        configuredCommandShellPath: commandShellPath
    });

    return `Policy: Choose one of the supported VS Code terminal profiles.\n${describeTerminalProfiles(profiles)}`;
}

