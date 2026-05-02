import { type ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { BRANDING } from '@webcode/shared';

export interface TerminalSessionSummary {
  id: string;
  name: string;
  command: string;
  cwd: string;
  status: 'starting' | 'running' | 'exited' | 'failed' | 'stopped';
  pid: number | null;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

interface TerminalSession extends TerminalSessionSummary {
  terminal: vscode.Terminal;
  pty: ManagedPseudoterminal;
  output: string;
}

class ManagedPseudoterminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number>();
  private child: ChildProcess | null = null;
  private started = false;
  private stopping = false;

  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;

  constructor(
    private readonly options: {
      commandLine: string;
      file: string;
      args: string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
      onSpawn: (child: ChildProcess) => void;
      onData: (chunk: string) => void;
      onExit: (result: { exitCode: number | null; signal: NodeJS.Signals | null; forced: boolean }) => void;
      log: (message: string) => void;
    }
  ) {}

  open(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.write(`\u001b[1;34m$ ${this.options.commandLine}\u001b[0m\r\n`);

    const child = spawn(this.options.file, this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.child = child;
    this.options.onSpawn(child);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      this.forwardOutput(chunk.toString());
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      this.forwardOutput(chunk.toString());
    });

    child.on('error', (error) => {
      this.options.log(`Terminal spawn failed: ${error.message}`);
      const rendered = `\r\n[spawn error] ${error.message}\r\n`;
      this.write(rendered);
      this.options.onData(rendered);
      this.options.onExit({ exitCode: 1, signal: null, forced: false });
      this.closeEmitter.fire(1);
    });

    child.on('exit', (exitCode, signal) => {
      const code = exitCode ?? (signal ? 1 : 0);
      const footer = signal
        ? `\r\n[process exited by signal ${signal}]\r\n`
        : `\r\n[process exited with code ${code}]\r\n`;
      this.write(footer);
      this.options.onData(footer);
      this.options.onExit({ exitCode, signal, forced: false });
      this.closeEmitter.fire(code);
    });
  }

  close(): void {
    if (
      !this.child
      || this.stopping
      || this.child.exitCode !== null
      || this.child.signalCode !== null
    ) {
      return;
    }

    this.stopping = true;
    this.options.log(`Terminal session process tree terminated by user.`);
    terminateProcessTree(this.child, this.options.log);
    this.options.onExit({ exitCode: null, signal: null, forced: true });
  }

  private forwardOutput(chunk: string) {
    const normalized = chunk.replace(/\n/g, '\r\n');
    this.write(normalized);
    this.options.onData(normalized);
  }

  private write(data: string) {
    this.writeEmitter.fire(data);
  }
}

function terminateProcessTree(child: ChildProcess, log: (message: string) => void): void {
  const pid = child.pid;
  if (!pid) {
    killChildProcess(child, log);
    return;
  }

  if (process.platform === 'win32') {
    terminateWindowsProcessTree(pid, child, log);
    return;
  }

  terminatePosixProcessGroup(pid, child, log);
}

function terminateWindowsProcessTree(pid: number, child: ChildProcess, log: (message: string) => void): void {
  const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore'
  });

  killer.on('error', (error) => {
    log(`Failed to run taskkill for process tree ${pid}: ${error.message}`);
    killChildProcess(child, log);
  });
}

function terminatePosixProcessGroup(pid: number, child: ChildProcess, log: (message: string) => void): void {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error: unknown) {
    log(`Failed to terminate process group ${pid}: ${formatUnknownError(error)}`);
    killChildProcess(child, log);
  }
}

function killChildProcess(child: ChildProcess, log: (message: string) => void): void {
  try {
    child.kill();
  } catch (error: unknown) {
    log(`Failed to terminate child process: ${formatUnknownError(error)}`);
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly maxOutputChars = 200_000;

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  createSession(params: {
    commandLine: string;
    file: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    autoFocus?: boolean;
  }): TerminalSessionSummary {
    const id = randomUUID().slice(0, 8);
    const name = `${BRANDING.terminalPrefix} ${id}`;
    const session = {} as TerminalSession;

    Object.assign(session, {
      id,
      name,
      command: params.commandLine,
      cwd: params.cwd,
      status: 'starting',
      pid: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      exitCode: null,
      signal: null,
      output: ''
    });

    const pty = new ManagedPseudoterminal({
      commandLine: params.commandLine,
      file: params.file,
      args: params.args,
      cwd: params.cwd,
      env: params.env,
      onSpawn: (child) => {
        session.pid = child.pid ?? null;
        session.status = 'running';
      },
      onData: (chunk) => {
        session.output += chunk;
        if (session.output.length > this.maxOutputChars) {
          session.output = session.output.slice(session.output.length - this.maxOutputChars);
        }
      },
      onExit: ({ exitCode, signal, forced }) => {
        if (session.endedAt) {
          return;
        }
        session.endedAt = new Date().toISOString();
        session.exitCode = exitCode;
        session.signal = signal;
        session.status = forced
          ? 'stopped'
          : exitCode && exitCode !== 0
            ? 'failed'
            : 'exited';
      },
      log: (message) => this.log(`[${id}] ${message}`)
    });

    const terminal = vscode.window.createTerminal({
      name,
      pty,
      isTransient: false
    });

    session.terminal = terminal;
    session.pty = pty;

    this.sessions.set(id, session);
    terminal.show(params.autoFocus === false);

    return this.toSummary(session);
  }

  listSessions(): TerminalSessionSummary[] {
    return Array.from(this.sessions.values())
      .map((session) => this.toSummary(session))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  getSession(sessionId: string): TerminalSessionSummary {
    return this.toSummary(this.requireSession(sessionId));
  }

  readSessionOutput(sessionId: string, tailLines = 200): { session: TerminalSessionSummary; output: string } {
    const session = this.requireSession(sessionId);
    const output = this.extractOutput(session, tailLines);
    return {
      session: this.toSummary(session),
      output
    };
  }

  stopSession(sessionId: string): TerminalSessionSummary {
    const session = this.requireSession(sessionId);
    session.pty.close();
    try {
      session.terminal.dispose();
    } catch {
      // ignore disposal errors
    }
    return this.toSummary(session);
  }

  private requireSession(sessionId: string): TerminalSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }
    return session;
  }

  private toSummary(session: TerminalSession): TerminalSessionSummary {
    return {
      id: session.id,
      name: session.name,
      command: session.command,
      cwd: session.cwd,
      status: session.status,
      pid: session.pid,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      exitCode: session.exitCode,
      signal: session.signal
    };
  }

  private extractOutput(session: TerminalSession, tailLines: number): string {
    const normalized = session.output.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    return lines.slice(-Math.max(1, tailLines)).join('\n').trim();
  }

  private log(message: string) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    this.outputChannel.appendLine(`[${time}] ${message}`);
  }
}
