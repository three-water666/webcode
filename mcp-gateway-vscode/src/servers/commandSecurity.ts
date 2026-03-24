import * as path from 'path';

const CROSS_PLATFORM_COMMANDS = [
  'npm', 'pnpm', 'yarn', 'bun', 'npx',
  'git', 'svn',
  'eslint', 'prettier', 'tsc',
  'vite', 'webpack', 'rollup', 'esbuild', 'parcel',
  'make', 'cmake', 'gradle', 'mvn', 'cargo', 'dotnet'
] as const;

const POSIX_ONLY_COMMANDS = [
  'ls', 'cat', 'touch', 'grep', 'pwd', 'test'
] as const;

const WINDOWS_ONLY_COMMANDS = [
  'where'
] as const;

const BLOCKED_PATH_FLAGS = [
  '-C', '--cwd', '--prefix', '--dir', '--git-dir', '--work-tree'
];

const BLOCKED_FLAG_PREFIXES = [
  '--cwd=',
  '--prefix=',
  '--dir=',
  '--git-dir=',
  '--work-tree='
];

const WINDOWS_CMD_SHIMS = new Set([
  'npm', 'pnpm', 'yarn', 'npx',
  'eslint', 'prettier', 'tsc',
  'vite', 'webpack', 'rollup', 'esbuild', 'parcel'
]);

export interface ParsedCommand {
  executable: string;
  args: string[];
  baseCommand: string;
}

export function getAllowedCommandsForPlatform(platform: NodeJS.Platform): Set<string> {
  const commands = new Set<string>(CROSS_PLATFORM_COMMANDS);

  if (platform === 'win32') {
    WINDOWS_ONLY_COMMANDS.forEach((command) => commands.add(command));
  } else {
    POSIX_ONLY_COMMANDS.forEach((command) => commands.add(command));
  }

  return commands;
}

export function parseCommandLine(command: string): { ok: true; value: ParsedCommand } | { ok: false; reason: string } {
  const trimmed = command.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Empty command' };
  }

  const safetyCheck = detectUnsafeShellSyntax(trimmed);
  if (!safetyCheck.ok) {
    return safetyCheck;
  }

  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaping = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\' && quote !== '\'') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += '\\';
  }

  if (quote) {
    return { ok: false, reason: 'Unterminated quoted string' };
  }

  if (current) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    return { ok: false, reason: 'Empty command' };
  }

  const executable = tokens[0];
  const baseCommand = path.basename(executable).replace(/\.(exe|cmd|bat|sh)$/i, '').toLowerCase();

  return {
    ok: true,
    value: {
      executable,
      args: tokens.slice(1),
      baseCommand
    }
  };
}

export function validateParsedCommand(
  parsed: ParsedCommand,
  options: { projectRoot: string; platform: NodeJS.Platform }
): { valid: true } | { valid: false; reason: string } {
  const allowedCommands = getAllowedCommandsForPlatform(options.platform);

  if (!allowedCommands.has(parsed.baseCommand)) {
    return {
      valid: false,
      reason: `Command "${parsed.baseCommand}" is not in the allowed whitelist for ${options.platform}.`
    };
  }

  for (const arg of parsed.args) {
    if (BLOCKED_PATH_FLAGS.includes(arg)) {
      return {
        valid: false,
        reason: `Blocked argument "${arg}" because it can redirect execution outside the workspace.`
      };
    }

    if (BLOCKED_FLAG_PREFIXES.some((prefix) => arg.startsWith(prefix))) {
      return {
        valid: false,
        reason: `Blocked argument "${arg}" because it can redirect execution outside the workspace.`
      };
    }

    if (arg.startsWith('~')) {
      return {
        valid: false,
        reason: `Blocked argument "${arg}" because home-directory expansion is not allowed.`
      };
    }

    if (path.isAbsolute(arg) && !isSubPath(options.projectRoot, path.normalize(arg))) {
      return {
        valid: false,
        reason: `Blocked absolute path outside workspace: "${arg}".`
      };
    }

    if (containsParentTraversal(arg)) {
      return {
        valid: false,
        reason: `Blocked parent-directory traversal in argument "${arg}".`
      };
    }

    if (options.platform === 'win32' && WINDOWS_CMD_SHIMS.has(parsed.baseCommand) && /[%!]/.test(arg)) {
      return {
        valid: false,
        reason: `Blocked Windows shell-expansion character in argument "${arg}".`
      };
    }
  }

  return { valid: true };
}

export function resolveExecutionPlan(
  parsed: ParsedCommand,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv
): { file: string; args: string[] } {
  if (platform !== 'win32') {
    return {
      file: parsed.executable,
      args: parsed.args
    };
  }

  if (!WINDOWS_CMD_SHIMS.has(parsed.baseCommand)) {
    return {
      file: parsed.executable,
      args: parsed.args
    };
  }

  const commandFile = parsed.executable.endsWith('.cmd') || parsed.executable.endsWith('.bat')
    ? parsed.executable
    : `${parsed.executable}.cmd`;

  return {
    file: env.comspec || 'cmd.exe',
    args: ['/d', '/s', '/c', buildWindowsCommandLine(commandFile, parsed.args)]
  };
}

export function formatAllowedCommands(platform: NodeJS.Platform): string {
  return Array.from(getAllowedCommandsForPlatform(platform)).sort().join(', ');
}

function detectUnsafeShellSyntax(command: string): { ok: true } | { ok: false; reason: string } {
  let quote: '"' | '\'' | null = null;
  let escaping = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    const nextChar = command[i + 1];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === '\\' && quote !== '\'') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === '\n' || char === '\r') {
      return { ok: false, reason: 'Blocked shell control operator: newline' };
    }

    if (char === '&' || char === ';' || char === '|' || char === '<' || char === '>' || char === '`') {
      return { ok: false, reason: `Blocked shell control operator: "${char}"` };
    }

    if (char === '$' && (nextChar === '(' || nextChar === '{')) {
      return { ok: false, reason: 'Blocked shell substitution syntax.' };
    }
  }

  return { ok: true };
}

function containsParentTraversal(arg: string): boolean {
  return /(^|[\\/])\.\.([\\/]|$)/.test(arg);
}

function isSubPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function buildWindowsCommandLine(executable: string, args: string[]): string {
  return [quoteForWindowsCmd(executable), ...args.map(quoteForWindowsCmd)].join(' ');
}

function quoteForWindowsCmd(arg: string): string {
  if (arg.length === 0) {
    return '""';
  }

  const escaped = arg.replace(/"/g, '""');
  if (/[\s()&[\]{}^=;!'+,`~%]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}
