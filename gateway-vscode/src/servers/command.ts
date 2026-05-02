import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile } from 'child_process';
import * as path from 'path';
import {
  describeShellCommandPolicy,
  normalizeShellCommand,
  resolveShellExecutionPlan,
} from './commandShell';
import {
  assessShellCommandRisk,
  formatCommandRiskAssessment,
} from './commandRisk';

function isSubPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// --- 命令行参数解析 --- 

function getProjectRoot() {
  const args = process.argv;
  const rootIndex = args.indexOf('--project-root');
  if (rootIndex !== -1 && args.length > rootIndex + 1) {
    return args[rootIndex + 1];
  }
  return null;
}

const projectRoot = getProjectRoot();

// --- MCP Server 核心逻辑 --- 

// 创建 MCP 服务器
const server = new McpServer({
  name: 'mcp-server-command',
  version: '1.0.0',
});

// 注册工具
server.registerTool(
  'execute_command',
  {
    description: 'Execute a short-lived POSIX shell command in the background and return stdout, stderr, and exitCode. Write commands as bash/POSIX shell text, like you would type in a Unix terminal: "git status", "pnpm test", "mkdir -p dist && pnpm build". On Windows this requires Git Bash and does not support cmd.exe or PowerShell syntax. Obviously destructive, privileged, or shell-escape commands are rejected before execution. For long-running commands or visible output, use run_in_terminal instead.',
    inputSchema: {
      command: z.string().describe('The POSIX shell command to execute (e.g., "git status", "pnpm test", "mkdir -p dist && pnpm build"). Use bash/POSIX syntax, not cmd.exe or PowerShell syntax.'),
      cwd: z.string().optional().describe('Optional: Current working directory. Must be within the workspace. Defaults to workspace root.'),
      timeout: z.number().int().min(1000).max(120000).default(60000).describe('Optional: Timeout in milliseconds (1000-120000, default: 60000).'),
    },
  },
  async ({ command, cwd, timeout }) => {
    // 0. 获取工作区根目录
    if (!projectRoot) {
      return {
        content: [
          { type: 'text', text: `❌ Security Error: Project root not configured. Command execution is disabled for safety.` },
        ],
        isError: true,
      };
    }

    // 1. 路径安全解析 (Path Sanitization)
    // 如果不传 cwd，默认为项目根目录 (projectRoot)
    let targetCwd = projectRoot;

    if (cwd) {
      // 解析绝对路径：如果是相对路径，则相对于 projectRoot 解析
      const resolvedCwd = path.isAbsolute(cwd) 
        ? path.normalize(cwd) 
        : path.resolve(projectRoot, cwd);

      // 🔒 安全检查：使用 path.relative 进行严格检查
      if (!isSubPath(projectRoot, resolvedCwd)) {
        return {
          content: [
            { type: 'text', text: `❌ Permission Denied: Access to '${cwd}' is forbidden. Path must be within workspace: ${projectRoot}` },
          ],
          isError: true,
        };
      }
      targetCwd = resolvedCwd;
    }

    let commandLine: string;
    try {
      commandLine = normalizeShellCommand(command);
    } catch (error: any) {
      return {
        content: [
          { type: 'text', text: `❌ Command Error: ${error.message}\nPolicy: ${describeShellCommandPolicy(process.platform)}` },
        ],
        isError: true,
      };
    }

    const risk = assessShellCommandRisk(commandLine);
    if (risk.level !== 'allowed') {
      return {
        content: [
          { type: 'text', text: `❌ Security Error: ${formatCommandRiskAssessment(risk)}` },
        ],
        isError: true,
      };
    }

    try {
      const execution = resolveShellExecutionPlan(commandLine, {
        platform: process.platform,
        env: process.env
      });

      // 3. 执行命令
      const result = await new Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        execFile(execution.file, execution.args, {
          cwd: targetCwd,
          timeout,
          maxBuffer: 1024 * 1024 * 10,
          windowsHide: true,
        }, (error, stdout, stderr) => {
          if (!error) {
            resolve({ stdout, stderr, exitCode: 0, signal: null });
            return;
          }

          const execError = error as NodeJS.ErrnoException & { code?: number | string; signal?: NodeJS.Signals | null; killed?: boolean };
          if (execError.code === 'ENOENT') {
            reject(new Error(`Command shell not found: ${execution.shell.path}`));
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

      const isError = result.exitCode !== 0;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              stdout: result.stdout.trim(),
              stderr: result.stderr.trim(),
              exitCode: result.exitCode,
              signal: result.signal,
              shell: {
                id: execution.shell.id,
                path: execution.shell.path
              },
              status: isError ? 'error' : (result.stderr ? 'completed_with_stderr' : 'success')
            }, null, 2)
          }
        ],
        isError,
      };
    } catch (error: any) {
      return {
        content: [
          { type: 'text', text: `❌ Execution System Error: ${error.message}\nPolicy: ${describeShellCommandPolicy(process.platform)}` },
        ],
        isError: true,
      };
    }
  }
);

// 启动服务器
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

