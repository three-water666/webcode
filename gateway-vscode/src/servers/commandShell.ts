import * as fs from 'fs';
import * as path from 'path';

export const COMMAND_SHELL_ENV = 'WEBCODE_COMMAND_SHELL';

export interface CommandShellProfile {
  id: 'git-bash' | 'bash' | 'zsh' | 'sh' | 'custom';
  path: string;
  login: boolean;
}

interface ResolveCommandShellOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  configuredPath?: string;
  exists?: (candidate: string) => boolean;
}

export class CommandShellResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandShellResolutionError';
  }
}

export function normalizeShellCommand(command: unknown): string {
  if (typeof command !== 'string') {
    throw new Error('command must be a string.');
  }

  const commandLine = command.trim();
  if (!commandLine) {
    throw new Error('command must not be empty.');
  }

  return commandLine;
}

export function resolveShellExecutionPlan(
  command: string,
  options: ResolveCommandShellOptions = {}
): { file: string; args: string[]; shell: CommandShellProfile } {
  const shell = resolveCommandShell(options);
  return {
    file: shell.path,
    args: shellArgsForCommand(shell, command),
    shell
  };
}

export function resolveCommandShell(options: ResolveCommandShellOptions = {}): CommandShellProfile {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const configuredPath = (options.configuredPath ?? env[COMMAND_SHELL_ENV] ?? '').trim();

  if (configuredPath) {
    if (!exists(configuredPath)) {
      throw new CommandShellResolutionError(
        `Configured command shell not found: ${configuredPath}. Check webcodeGateway.commandShell.path.`
      );
    }

    return shellProfileFromPath(configuredPath, 'custom');
  }

  if (platform === 'win32') {
    return resolveWindowsGitBash(env, exists);
  }

  return resolvePosixShell(env, exists);
}

export function describeShellCommandPolicy(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return 'Commands must use POSIX/bash syntax and run through Git Bash on Windows; cmd.exe and PowerShell syntax are not supported.';
  }

  return 'Commands must use POSIX shell syntax and run through the user shell or a system POSIX shell.';
}

function resolveWindowsGitBash(env: NodeJS.ProcessEnv, exists: (candidate: string) => boolean): CommandShellProfile {
  const candidates = unique([
    env.ProgramW6432 ? path.win32.join(env.ProgramW6432, 'Git', 'bin', 'bash.exe') : '',
    env.ProgramW6432 ? path.win32.join(env.ProgramW6432, 'Git', 'usr', 'bin', 'bash.exe') : '',
    env.ProgramFiles ? path.win32.join(env.ProgramFiles, 'Git', 'bin', 'bash.exe') : '',
    env.ProgramFiles ? path.win32.join(env.ProgramFiles, 'Git', 'usr', 'bin', 'bash.exe') : '',
    env['ProgramFiles(x86)'] ? path.win32.join(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe') : '',
    env['ProgramFiles(x86)'] ? path.win32.join(env['ProgramFiles(x86)'], 'Git', 'usr', 'bin', 'bash.exe') : '',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
    ...findGitBashOnPath(env)
  ]);

  const shellPath = candidates.find(candidate => candidate && exists(candidate));
  if (shellPath) {
    return {
      id: 'git-bash',
      path: shellPath,
      login: true
    };
  }

  throw new CommandShellResolutionError(
    'Git Bash is required to run POSIX shell commands on Windows, but bash.exe was not found. ' +
    'Install Git for Windows or set webcodeGateway.commandShell.path to the Git Bash bash.exe path.'
  );
}

function resolvePosixShell(env: NodeJS.ProcessEnv, exists: (candidate: string) => boolean): CommandShellProfile {
  const candidates = unique([
    isSupportedPosixShell(env.SHELL) ? env.SHELL : '',
    '/bin/zsh',
    '/usr/bin/zsh',
    '/bin/bash',
    '/usr/bin/bash',
    '/bin/sh',
    '/usr/bin/sh'
  ]);

  const shellPath = candidates.find(candidate => candidate && exists(candidate));
  if (shellPath) {
    return shellProfileFromPath(shellPath);
  }

  throw new CommandShellResolutionError(
    'No POSIX command shell was found. Set webcodeGateway.commandShell.path to bash, zsh, or sh.'
  );
}

function shellProfileFromPath(shellPath: string, forcedId?: CommandShellProfile['id']): CommandShellProfile {
  const baseName = basenameAnyPlatform(shellPath).toLowerCase();
  const inferredId = shellIdFromBasename(baseName);
  const id = forcedId ?? inferredId;

  return {
    id,
    path: shellPath,
    login: inferredId === 'bash' || inferredId === 'zsh' || id === 'git-bash'
  };
}

function shellArgsForCommand(shell: CommandShellProfile, command: string): string[] {
  return shell.login ? ['-lc', command] : ['-c', command];
}

function shellIdFromBasename(baseName: string): CommandShellProfile['id'] {
  if (baseName === 'zsh') {
    return 'zsh';
  }

  if (baseName === 'bash' || baseName === 'bash.exe') {
    return 'bash';
  }

  return 'sh';
}

function isSupportedPosixShell(shellPath: string | undefined): shellPath is string {
  if (!shellPath) {
    return false;
  }

  const baseName = basenameAnyPlatform(shellPath).toLowerCase();
  return baseName === 'bash' || baseName === 'zsh' || baseName === 'sh';
}

function findGitBashOnPath(env: NodeJS.ProcessEnv): string[] {
  const pathValue = env.Path ?? env.PATH ?? '';
  return pathValue
    .split(';')
    .filter(entry => /[\\/]git[\\/]/i.test(entry))
    .flatMap(entry => {
      const direct = path.win32.join(entry, 'bash.exe');
      if (basenameAnyPlatform(entry).toLowerCase() === 'cmd') {
        return [direct, path.win32.join(path.win32.dirname(entry), 'bin', 'bash.exe')];
      }

      return [direct];
    });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function basenameAnyPlatform(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}
