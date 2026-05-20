import { execFile } from 'child_process';
import type { LocalTool } from './types';
import { errorResult, jsonResult } from './result';
import { resolveWorkspaceDirectory } from './filesystemUtils';
import {
    describeShellCommandPolicy,
    normalizeShellCommand,
    resolveShellExecutionPlan
} from '../servers/commandShell';
import {
    assessShellCommandRisk,
    formatCommandRiskAssessment
} from '../servers/commandRisk';

export const executeCommandTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'execute_command',
        description: 'Execute a short-lived POSIX/bash shell command in the background and return stdout, stderr, and exitCode. Use this for builds, tests, package managers, git, and project scripts. Do not use it to read or search files; use read_file, search_files, or search_code instead. On Windows this requires Git Bash and does not support cmd.exe or PowerShell syntax. For long-running commands or visible output, use run_in_terminal.',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', minLength: 1, description: 'POSIX/bash command to execute, for example "git status" or "pnpm test". Do not run grep, rg, find, cat, sed, awk, or nl just to inspect workspace files; use the dedicated file/search tools.' },
                cwd: { type: 'string', description: 'Optional working directory inside the workspace. Defaults to the workspace root.' },
                timeout: { type: 'integer', minimum: 1000, maximum: 120000, description: 'Timeout in milliseconds. Default: 60000.', default: 60000 }
            },
            required: ['command']
        }
    },
    async execute(args, context) {
        if (!context.workspaceRoot) {
            return errorResult('Security Error: A VS Code workspace folder is required to run commands.');
        }

        let commandLine: string;
        try {
            commandLine = normalizeShellCommand(args.command);
        } catch (error: any) {
            return errorResult(`Command Error: ${error.message}\nPolicy: ${describeShellCommandPolicy(process.platform)}`);
        }

        const risk = assessShellCommandRisk(commandLine);
        if (risk.level !== 'allowed') {
            return errorResult(`Security Error: ${formatCommandRiskAssessment(risk)}`);
        }

        try {
            const cwdArg = typeof args.cwd === 'string' && args.cwd.trim() === '' ? '.' : args.cwd ?? '.';
            const cwd = await resolveWorkspaceDirectory(context.workspaceRoot, cwdArg);
            const timeout = typeof args.timeout === 'number' ? args.timeout : 60000;
            const execution = resolveShellExecutionPlan(commandLine, {
                platform: process.platform,
                env: process.env,
                configuredPath: context.commandShellPath
            });
            const result = await runCommand(execution.file, execution.args, cwd, timeout);
            const isError = result.exitCode !== 0;

            return jsonResult({
                stdout: result.stdout.trim(),
                stderr: result.stderr.trim(),
                exitCode: result.exitCode,
                signal: result.signal,
                shell: {
                    id: execution.shell.id,
                    path: execution.shell.path
                },
                status: isError ? 'error' : (result.stderr ? 'completed_with_stderr' : 'success')
            }, isError);
        } catch (error: any) {
            return errorResult(`Execution System Error: ${error.message}\nPolicy: ${describeShellCommandPolicy(process.platform)}`);
        }
    }
};


async function runCommand(
    file: string,
    args: string[],
    cwd: string,
    timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number; signal: NodeJS.Signals | null }> {
    return new Promise((resolve, reject) => {
        execFile(file, args, {
            cwd,
            timeout,
            maxBuffer: 1024 * 1024 * 10,
            windowsHide: true
        }, (error, stdout, stderr) => {
            if (!error) {
                resolve({ stdout, stderr, exitCode: 0, signal: null });
                return;
            }

            const execError = error as NodeJS.ErrnoException & { code?: number | string; signal?: NodeJS.Signals | null };
            if (execError.code === 'ENOENT') {
                reject(new Error(`Command shell not found: ${file}`));
                return;
            }

            resolve({
                stdout: stdout || '',
                stderr: stderr || execError.message,
                exitCode: typeof execError.code === 'number' ? execError.code : 1,
                signal: execError.signal ?? null
            });
        });
    });
}
