import * as path from 'path';

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

const DIRECT_BLOCKED_COMMANDS = new Set([
  'bash', 'sh', 'zsh', 'fish',
  'cmd', 'powershell', 'pwsh',
  'sudo', 'su',
  'reg', 'sc', 'netsh',
  'shutdown', 'reboot', 'halt', 'poweroff',
  'format', 'diskpart',
  'rm', 'rmdir', 'del', 'erase'
]);

const INTERPRETER_EVAL_FLAGS = new Map<string, string[]>([
  ['python', ['-c']],
  ['python3', ['-c']],
  ['py', ['-c']],
  ['node', ['-e', '--eval', '-p', '--print']],
  ['deno', ['eval']],
  ['ruby', ['-e']],
  ['perl', ['-e']],
  ['php', ['-r']],
  ['bun', ['eval', '-e']]
]);

export interface ParsedCommand {
  executable: string;
  args: string[];
  baseCommand: string;
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
  if (DIRECT_BLOCKED_COMMANDS.has(parsed.baseCommand)) {
    return {
      valid: false,
      reason: `Blocked command "${parsed.baseCommand}" because it is a high-risk shell or system command.`
    };
  }

  const blockedEvalFlags = INTERPRETER_EVAL_FLAGS.get(parsed.baseCommand);
  if (blockedEvalFlags && parsed.args.some((arg) => blockedEvalFlags.includes(arg))) {
    return {
      valid: false,
      reason: `Blocked command "${parsed.baseCommand}" because inline code execution flags are not allowed.`
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

    if (options.platform === 'win32' && /[%!]/.test(arg)) {
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

  if (hasWindowsExecutableExtension(parsed.executable) || hasPathSeparator(parsed.executable)) {
    return {
      file: parsed.executable,
      args: parsed.args
    };
  }

  return {
    file: env.comspec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', buildWindowsCommandLine(parsed.executable, parsed.args)]
  };
}

export function formatAllowedCommands(platform: NodeJS.Platform): string {
  return `single command only; workspace-scoped paths only; high-risk shell/system commands blocked on ${platform}`;
}

export function formatCommandPolicyError(reason: string): string {
  if (isCommandChainingReason(reason)) {
    return `${reason} This tool accepts exactly one command per call. Split chained workflows into multiple tool calls and execute them one command at a time.`;
  }

  return reason;
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

function isCommandChainingReason(reason: string): boolean {
  return reason === 'Blocked shell control operator: newline'
    || reason.startsWith('Blocked shell control operator:')
    || reason === 'Blocked shell substitution syntax.';
}

function containsParentTraversal(arg: string): boolean {
  return /(^|[\\/])\.\.([\\/]|$)/.test(arg);
}

function hasPathSeparator(value: string): boolean {
  return /[\\/]/.test(value);
}

function hasWindowsExecutableExtension(executable: string): boolean {
  return /\.(exe|cmd|bat|com|ps1)$/i.test(executable);
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
