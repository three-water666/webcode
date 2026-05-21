import type { CommandApprovalScope } from "../modules/ui";
import type { ToolExecutionPayload } from "../types";

const COMMAND_APPROVAL_TOOLS = new Set(["execute_command", "run_in_terminal"]);

export interface ApprovalState {
  allowedTools: Set<string>;
  allowedCommandRules: Set<string>;
}

export function createApprovalState(): ApprovalState {
  return {
    allowedTools: new Set<string>(),
    allowedCommandRules: new Set<string>(),
  };
}

export function parseStoredApprovalEntries(rawEntries: unknown): ApprovalState {
  const approvalState = createApprovalState();
  if (!Array.isArray(rawEntries)) {
    return approvalState;
  }

  for (const entry of rawEntries) {
    if (typeof entry !== "string") {continue;}
    if (entry.startsWith("command:")) {
      approvalState.allowedCommandRules.add(upgradeLegacyCommandRule(entry));
    } else if (entry.startsWith("tool:")) {
      approvalState.allowedTools.add(entry.slice("tool:".length));
    } else {
      approvalState.allowedTools.add(entry);
    }
  }

  return approvalState;
}

export function buildStoredApprovalEntries(approvalState: ApprovalState): string[] {
  return [
    ...Array.from(approvalState.allowedTools).sort().map((toolName) => `tool:${toolName}`),
    ...Array.from(approvalState.allowedCommandRules).sort(),
  ];
}

export function isPayloadApproved(payload: ToolExecutionPayload, approvalState: ApprovalState): boolean {
  if (!COMMAND_APPROVAL_TOOLS.has(payload.name)) {
    return approvalState.allowedTools.has(payload.name);
  }

  return getCommandApprovalRules(payload).some((rule) => approvalState.allowedCommandRules.has(rule));
}

export function persistApprovalRule(
  payload: ToolExecutionPayload,
  scope: Exclude<CommandApprovalScope, false>,
  approvalState: ApprovalState
): void {
  if (!COMMAND_APPROVAL_TOOLS.has(payload.name)) {
    approvalState.allowedTools.add(payload.name);
    return;
  }

  const commandRule = getCommandApprovalRule(payload, scope);
  if (commandRule) {
    approvalState.allowedCommandRules.add(commandRule);
  }
}

export function getApprovalLabel(
  payload: ToolExecutionPayload,
  scope: Exclude<CommandApprovalScope, false> = "exact"
): string {
  const command = getPayloadCommand(payload);
  if (COMMAND_APPROVAL_TOOLS.has(payload.name) && command) {
    const rule = getCommandApprovalRule(payload, scope);
    return rule ? `${payload.name} -> ${rule}` : `${payload.name} -> ${command}`;
  }
  return payload.name;
}

function getCommandApprovalRules(payload: ToolExecutionPayload): string[] {
  const exact = getCommandApprovalRule(payload, "exact");
  const executable = getCommandApprovalRule(payload, "executable");
  const prefix = getCommandApprovalRule(payload, "prefix");
  return [exact, executable, prefix].filter((value): value is string => Boolean(value));
}

function getCommandApprovalRule(
  payload: ToolExecutionPayload,
  scope: Exclude<CommandApprovalScope, false>
): string | null {
  const command = getPayloadCommand(payload);
  if (!command) {return null;}

  if (scope === "exact") {
    return `command-exact:${payload.name}:${command}`;
  }

  const executable = getNormalizedCommandExecutable(command);
  if (!executable) {return null;}

  if (scope === "executable") {
    return `command-executable:${payload.name}:${executable}`;
  }

  const prefix = getNormalizedCommandPrefix(command);
  return prefix ? `command-prefix:${payload.name}:${prefix}` : null;
}

function getPayloadCommand(payload: ToolExecutionPayload): string | null {
  const args: unknown = payload.arguments;
  if (!isRecord(args)) {return null;}
  return normalizeCommandValue(args.command);
}

function normalizeCommandValue(command: unknown): string | null {
  if (typeof command !== "string") {return null;}
  const normalized = command.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function getNormalizedCommandExecutable(command: string): string | null {
  const tokens = tokenizeCommandLine(command);
  return tokens[0] || null;
}

function getNormalizedCommandPrefix(command: string): string | null {
  const tokens = tokenizeCommandLine(command);
  if (tokens.length === 0) {return null;}
  if (tokens.length === 1) {return tokens[0];}
  return `${tokens[0]} ${tokens[1]}`;
}

function tokenizeCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
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

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function upgradeLegacyCommandRule(entry: string): string {
  if (!entry.startsWith("command:")) {
    return entry;
  }

  return entry.replace(/^command:/, "command-exact:");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
