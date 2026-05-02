type CommandRiskLevel = 'allowed' | 'dangerous' | 'blocked';

export interface CommandRiskAssessment {
  level: CommandRiskLevel;
  reasons: string[];
}

export class CommandRiskError extends Error {
  constructor(readonly assessment: CommandRiskAssessment) {
    super(formatCommandRiskAssessment(assessment));
    this.name = 'CommandRiskError';
  }
}

const BLOCKED_COMMANDS = new Map<string, string>([
  ['sudo', 'Privilege escalation with sudo is not allowed.'],
  ['su', 'Privilege escalation with su is not allowed.'],
  ['cmd', 'cmd.exe is not allowed; use POSIX shell syntax.'],
  ['powershell', 'PowerShell is not allowed; use POSIX shell syntax.'],
  ['pwsh', 'PowerShell is not allowed; use POSIX shell syntax.'],
  ['shutdown', 'System shutdown commands are not allowed.'],
  ['reboot', 'System reboot commands are not allowed.'],
  ['halt', 'System shutdown commands are not allowed.'],
  ['poweroff', 'System shutdown commands are not allowed.'],
  ['diskpart', 'Disk partitioning commands are not allowed.'],
  ['format', 'Disk formatting commands are not allowed.'],
  ['reg', 'Windows registry commands are not allowed.'],
  ['sc', 'Windows service control commands are not allowed.'],
  ['netsh', 'Network configuration commands are not allowed.'],
  ['mkfs', 'Filesystem formatting commands are not allowed.'],
  ['dd', 'Raw disk copy commands are not allowed.']
]);

const SHELL_COMMANDS = new Set(['bash', 'sh', 'zsh', 'fish']);
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

export function assessShellCommandRisk(command: string): CommandRiskAssessment {
  const blocked: string[] = [];
  const dangerous: string[] = [];

  if (pipesIntoShell(command)) {
    blocked.push('Piping data into a shell interpreter is not allowed.');
  }

  for (const segment of splitShellSegments(command)) {
    const words = splitShellWords(segment);
    const commandIndex = findCommandIndex(words);
    if (commandIndex === -1) {
      continue;
    }

    const commandName = normalizeCommandName(words[commandIndex]);
    const args = words.slice(commandIndex + 1);
    const blockedReason = BLOCKED_COMMANDS.get(commandName);

    if (blockedReason) {
      blocked.push(blockedReason);
      continue;
    }

    if (SHELL_COMMANDS.has(commandName) && hasShellEvalFlag(args)) {
      blocked.push(`Nested shell evaluation with ${commandName} -c is not allowed.`);
      continue;
    }

    const evalFlags = INTERPRETER_EVAL_FLAGS.get(commandName);
    if (evalFlags && args.some(arg => evalFlags.includes(arg))) {
      dangerous.push(`Inline code execution with ${commandName} is not allowed.`);
      continue;
    }

    dangerous.push(...assessDangerousCommand(commandName, args));
  }

  const reasons = unique(blocked.length > 0 ? blocked : dangerous);
  return {
    level: blocked.length > 0 ? 'blocked' : dangerous.length > 0 ? 'dangerous' : 'allowed',
    reasons
  };
}

export function assertShellCommandRiskAllowed(command: string): void {
  const assessment = assessShellCommandRisk(command);
  if (assessment.level !== 'allowed') {
    throw new CommandRiskError(assessment);
  }
}

export function formatCommandRiskAssessment(assessment: CommandRiskAssessment): string {
  if (assessment.level === 'allowed') {
    return 'Command risk assessment passed.';
  }

  return `Command rejected by ${assessment.level} risk policy: ${assessment.reasons.join(' ')}`;
}

function assessDangerousCommand(commandName: string, args: string[]): string[] {
  if (commandName === 'rm') {
    return assessRm(args);
  }

  if (commandName === 'git') {
    return assessGit(args);
  }

  if (commandName === 'find' && args.includes('-delete')) {
    return ['find -delete can remove many files and is not allowed.'];
  }

  if (commandName === 'chmod' && hasRecursiveFlag(args) && args.includes('777')) {
    return ['Recursive chmod 777 is not allowed.'];
  }

  if (commandName === 'chown' && hasRecursiveFlag(args)) {
    return ['Recursive chown is not allowed.'];
  }

  return [];
}

function assessRm(args: string[]): string[] {
  if (!hasRecursiveFlag(args)) {
    return [];
  }

  const targets = args.filter(arg => !arg.startsWith('-') && arg !== '--');
  if (targets.some(isDangerousRmTarget)) {
    return ['Recursive removal of workspace root, parent paths, .git, shell variables, or broad wildcards is not allowed.'];
  }

  return [];
}

function assessGit(args: string[]): string[] {
  const subcommand = args[0];
  if (subcommand === 'reset' && args.includes('--hard')) {
    return ['git reset --hard is not allowed.'];
  }

  if (subcommand === 'clean' && hasCombinedFlags(args, ['f', 'd', 'x'])) {
    return ['git clean -fdx is not allowed.'];
  }

  if (subcommand === 'push' && args.some(arg => arg === '--force' || arg === '-f' || arg.startsWith('--force-with-lease'))) {
    return ['Force-pushing with git push is not allowed.'];
  }

  return [];
}

function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\' && quote !== '\'') {
      current += char;
      escaping = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (isShellQuote(char)) {
      quote = char;
      current += char;
      continue;
    }

    if (isShellSegmentDelimiter(char)) {
      pushSegment(segments, current);
      current = '';
      continue;
    }

    current += char;
  }

  pushSegment(segments, current);
  return segments;
}

function splitShellWords(segment: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaping = false;

  for (const char of segment.trim()) {
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

    if (isShellQuote(char)) {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      pushWord(words, current);
      current = '';
      continue;
    }

    current += char;
  }

  pushWord(words, current);
  return words;
}

function findCommandIndex(words: string[]): number {
  let index = 0;
  while (isEnvironmentAssignment(words[index])) {
    index += 1;
  }

  if (words[index] === 'env') {
    index += 1;
    while (isEnvironmentAssignment(words[index])) {
      index += 1;
    }
  }

  return index < words.length ? index : -1;
}

function pipesIntoShell(command: string): boolean {
  return /\|\s*(?:\S*[\\/])?(?:sh|bash|zsh|fish)(?:\s|$)/i.test(command);
}

function isDangerousRmTarget(target: string): boolean {
  const exactDangerousTargets = new Set(['/', '~', '.', '..', '*', './*', '/*', '~/*', '.git']);
  return exactDangerousTargets.has(target)
    || target.startsWith('../')
    || target.startsWith('$')
    || target.includes('/.git')
    || target.includes('\\.git');
}

function isShellQuote(char: string): char is '"' | '\'' {
  return char === '"' || char === '\'';
}

function isShellSegmentDelimiter(char: string): boolean {
  return char === ';' || char === '|' || char === '&' || char === '\n' || char === '\r';
}

function hasRecursiveFlag(args: string[]): boolean {
  return args.some(arg => arg === '--recursive' || /^-[^-]*[rR]/.test(arg));
}

function hasCombinedFlags(args: string[], requiredFlags: string[]): boolean {
  const flagChars = args
    .filter(arg => /^-[A-Za-z]+$/.test(arg))
    .join('');

  return requiredFlags.every(flag => flagChars.includes(flag));
}

function hasShellEvalFlag(args: string[]): boolean {
  return args.some(arg => /^-[^-]*c/.test(arg) || arg === '--command');
}

function normalizeCommandName(command: string): string {
  const baseName = command.split(/[\\/]/).pop() ?? command;
  return baseName.replace(/\.(exe|cmd|bat|sh)$/i, '').toLowerCase();
}

function isEnvironmentAssignment(value: string | undefined): boolean {
  return Boolean(value && /^[A-Za-z_][A-Za-z0-9_]*=/.test(value));
}

function pushSegment(segments: string[], segment: string): void {
  const trimmed = segment.trim();
  if (trimmed) {
    segments.push(trimmed);
  }
}

function pushWord(words: string[], word: string): void {
  if (word) {
    words.push(word);
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
