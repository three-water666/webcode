import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { BRANDING } from '@webcode/shared';
import type { TerminalShellKind, WebcodeTerminalProfile } from './servers/terminalProfiles';

type TerminalSessionStatus = 'starting' | 'running' | 'interrupting' | 'unknown' | 'exited' | 'failed' | 'stopped';
type TerminalOutputCapture = 'pending' | 'shellIntegration' | 'unavailable';

export interface TerminalSessionProfileSummary {
  id: string;
  label: string;
  shellKind: TerminalShellKind;
  source: string;
}

export interface TerminalSessionSummary {
  id: string;
  name: string;
  command: string;
  cwd: string;
  status: TerminalSessionStatus;
  pid: number | null;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  capture: TerminalOutputCapture;
  stopRequested: boolean;
  profile: TerminalSessionProfileSummary;
}

interface TerminalSession extends TerminalSessionSummary {
  terminal: vscode.Terminal;
  output: string;
  closeDisposable: vscode.Disposable | null;
}

interface ExecutionEndWaiter {
  dispose: () => void;
  promise: Promise<number | undefined>;
  watch: (execution: vscode.TerminalShellExecution) => void;
}

export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly maxOutputChars = 200_000;
  private readonly shellIntegrationTimeoutMs = 3000;

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  createSession(params: {
    commandLine: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    profile: WebcodeTerminalProfile;
    autoFocus?: boolean;
  }): TerminalSessionSummary {
    const id = randomUUID().slice(0, 8);
    const name = `${BRANDING.terminalPrefix} ${id}`;
    const terminal = vscode.window.createTerminal(createTerminalOptions(name, params));
    const session = this.createSessionState(id, name, terminal, params);

    this.sessions.set(id, session);
    session.closeDisposable = this.registerCloseHandler(session);
    terminal.show(params.autoFocus === false);
    void this.updateProcessId(session);
    void this.startCommand(session, params.commandLine);

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
    this.interruptSession(session);
    return this.toSummary(session);
  }

  closeSession(sessionId: string): TerminalSessionSummary {
    const session = this.requireSession(sessionId);
    if (!session.endedAt) {
      this.finishSession(session, { exitCode: null, stopped: true });
    }

    session.closeDisposable?.dispose();
    session.closeDisposable = null;
    session.terminal.dispose();
    return this.toSummary(session);
  }

  private createSessionState(
    id: string,
    name: string,
    terminal: vscode.Terminal,
    params: { commandLine: string; cwd: string; profile: WebcodeTerminalProfile }
  ): TerminalSession {
    return {
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
      capture: 'pending',
      stopRequested: false,
      profile: summarizeProfile(params.profile),
      terminal,
      output: '',
      closeDisposable: null
    };
  }

  private async updateProcessId(session: TerminalSession): Promise<void> {
    try {
      session.pid = await session.terminal.processId ?? null;
    } catch (error: unknown) {
      this.log(`[${session.id}] Failed to read terminal process id: ${formatUnknownError(error)}`);
    }
  }

  private async startCommand(session: TerminalSession, commandLine: string): Promise<void> {
    const shellIntegration = await this.waitForShellIntegration(session.terminal, this.shellIntegrationTimeoutMs);
    if (session.endedAt || session.stopRequested) {
      return;
    }

    if (!shellIntegration) {
      this.sendWithoutCapture(session, commandLine, 'VS Code shell integration did not activate.');
      return;
    }

    this.executeWithShellIntegration(session, shellIntegration, commandLine);
  }

  private executeWithShellIntegration(
    session: TerminalSession,
    shellIntegration: vscode.TerminalShellIntegration,
    commandLine: string
  ): void {
    if (session.stopRequested) {
      return;
    }

    const waiter = this.createExecutionEndWaiter(session.terminal);
    let execution: vscode.TerminalShellExecution;

    try {
      execution = shellIntegration.executeCommand(commandLine);
    } catch (error: unknown) {
      waiter.dispose();
      this.sendWithoutCapture(session, commandLine, `Shell integration execution failed: ${formatUnknownError(error)}`);
      return;
    }

    waiter.watch(execution);
    session.capture = 'shellIntegration';
    session.status = 'running';
    void this.collectExecutionOutput(session, execution);
    void this.finishWhenExecutionEnds(session, waiter);
  }

  private async finishWhenExecutionEnds(session: TerminalSession, waiter: ExecutionEndWaiter): Promise<void> {
    try {
      const exitCode = await waiter.promise;
      if (!session.endedAt) {
        this.finishSession(session, { exitCode: exitCode ?? null, stopped: session.stopRequested || exitCode === undefined });
      }
    } finally {
      waiter.dispose();
    }
  }

  private async collectExecutionOutput(
    session: TerminalSession,
    execution: vscode.TerminalShellExecution
  ): Promise<void> {
    try {
      for await (const chunk of execution.read()) {
        this.appendOutput(session, normalizeOutput(chunk));
      }
    } catch (error: unknown) {
      this.log(`[${session.id}] Failed to read terminal output: ${formatUnknownError(error)}`);
    }
  }

  private sendWithoutCapture(session: TerminalSession, commandLine: string, reason: string): void {
    session.capture = 'unavailable';
    session.status = 'unknown';
    this.appendOutput(
      session,
      `[webcode] ${reason} Command was sent to the terminal, but output, exit code, and completion status cannot be captured.\n`
    );
    session.terminal.sendText(commandLine, true);
  }

  private waitForShellIntegration(
    terminal: vscode.Terminal,
    timeoutMs: number
  ): Promise<vscode.TerminalShellIntegration | null> {
    if (terminal.shellIntegration) {
      return Promise.resolve(terminal.shellIntegration);
    }

    return new Promise(resolve => {
      let timer: NodeJS.Timeout | null = null;
      const disposable = vscode.window.onDidChangeTerminalShellIntegration(event => {
        if (event.terminal !== terminal) {
          return;
        }

        if (timer) {
          clearTimeout(timer);
        }
        disposable.dispose();
        resolve(event.shellIntegration);
      });

      timer = setTimeout(() => {
        disposable.dispose();
        resolve(terminal.shellIntegration ?? null);
      }, timeoutMs);
    });
  }

  private createExecutionEndWaiter(terminal: vscode.Terminal): ExecutionEndWaiter {
    let watchedExecution: vscode.TerminalShellExecution | null = null;
    let resolveEnd: (exitCode: number | undefined) => void = () => undefined;
    const promise = new Promise<number | undefined>(resolve => {
      resolveEnd = resolve;
    });
    const disposable = vscode.window.onDidEndTerminalShellExecution(event => {
      if (event.terminal !== terminal || event.execution !== watchedExecution) {
        return;
      }

      disposable.dispose();
      resolveEnd(event.exitCode);
    });

    return {
      dispose: () => {
        disposable.dispose();
      },
      promise,
      watch: execution => {
        watchedExecution = execution;
      }
    };
  }

  private interruptSession(session: TerminalSession): void {
    if (session.endedAt) {
      return;
    }

    session.stopRequested = true;
    session.status = 'interrupting';
    session.terminal.sendText('\x03', false);
    this.appendOutput(session, '\n[interrupt requested]\n');
  }

  private registerCloseHandler(session: TerminalSession): vscode.Disposable {
    return vscode.window.onDidCloseTerminal(terminal => {
      if (terminal !== session.terminal || session.endedAt) {
        return;
      }

      this.finishSession(session, { exitCode: null, stopped: true });
    });
  }

  private finishSession(session: TerminalSession, result: { exitCode: number | null; stopped: boolean }): void {
    if (session.endedAt) {
      return;
    }

    session.endedAt = new Date().toISOString();
    session.exitCode = result.exitCode;
    session.signal = null;
    session.status = result.stopped
      ? 'stopped'
      : result.exitCode && result.exitCode !== 0
        ? 'failed'
        : 'exited';
    this.appendOutput(session, `\n[process ${session.status}${result.exitCode === null ? '' : ` with code ${result.exitCode}`}]\n`);
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
      signal: session.signal,
      capture: session.capture,
      stopRequested: session.stopRequested,
      profile: session.profile
    };
  }

  private extractOutput(session: TerminalSession, tailLines: number): string {
    const lines = session.output.split('\n');
    return lines.slice(-Math.max(1, tailLines)).join('\n').trim();
  }

  private appendOutput(session: TerminalSession, chunk: string): void {
    session.output += chunk;
    if (session.output.length > this.maxOutputChars) {
      session.output = session.output.slice(session.output.length - this.maxOutputChars);
    }
  }

  private log(message: string): void {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    this.outputChannel.appendLine(`[${time}] ${message}`);
  }
}

function createTerminalOptions(
  name: string,
  params: { cwd: string; env: NodeJS.ProcessEnv; profile: WebcodeTerminalProfile }
): vscode.TerminalOptions {
  const options: vscode.TerminalOptions = {
    name,
    cwd: params.cwd,
    env: params.env,
    isTransient: false
  };

  if (!params.profile.useVSCodeDefault) {
    options.shellPath = params.profile.shellPath;
    options.shellArgs = params.profile.shellArgs;
  }

  return options;
}

function summarizeProfile(profile: WebcodeTerminalProfile): TerminalSessionProfileSummary {
  return {
    id: profile.id,
    label: profile.label,
    shellKind: profile.shellKind,
    source: profile.source
  };
}

function normalizeOutput(chunk: string): string {
  return chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
