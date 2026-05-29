import { type Session, type ToolExecutionPayload } from '@webcode/shared';
import { type SiteSelectors } from './modules/config';

// Re-export shared types for convenience
export type { Session, ToolExecutionPayload };

// === Extension-Internal Types ===

export interface MessageRequest {
  type: string;
  tabId?: number;
  port?: number;
  token?: string;
  targetOrigin?: string;
  workspaceId?: string;
  force?: boolean;
  show?: boolean;
  title?: string;
  message?: string;
  onlyWhenWindowInBackground?: boolean;
  playSound?: boolean;
  connected?: boolean;
  payload?: ToolExecutionPayload;
}

export interface HandshakeResponse {
  success: boolean;
  error?: string;
  conflictTabId?: string;
}

export interface StatusResponse {
  connected: boolean;
  error?: string;
  port?: number;
  showLog?: boolean;
  workspaceId?: string;
}

export interface SuccessResponse {
  success: boolean;
  error?: string;
}

export interface SyncedAiSite {
  name?: string;
  address: string;
  selectors?: unknown;
}

export interface StoredSession {
  port: number;
  token: string;
  showLog?: boolean;
  workspaceId?: string;
  allowedOrigins?: string[];
}

export interface InitGatewayData {
  syncedAiSites?: SyncedAiSite[];
  prompts?: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMessageRequest(value: unknown): value is MessageRequest {
  return isRecord(value) && typeof value.type === "string";
}

export function isSuccessResponse(value: unknown): value is SuccessResponse {
  return isRecord(value) && typeof value.success === "boolean";
}

export function isStatusResponse(value: unknown): value is StatusResponse {
  return isRecord(value) && typeof value.connected === "boolean";
}

export function isSession(value: unknown): value is Session {
  return isStoredSession(value) &&
    typeof value.showLog === "boolean" &&
    typeof value.workspaceId === "string";
}

export function isStoredSession(value: unknown): value is StoredSession {
  if (!isRecord(value)) {return false;}

  const allowedOrigins = value.allowedOrigins;
  return typeof value.port === "number" &&
    typeof value.token === "string" &&
    (
      value.showLog === undefined ||
      typeof value.showLog === "boolean"
    ) &&
    (
      value.workspaceId === undefined ||
      typeof value.workspaceId === "string"
    ) &&
    (
      allowedOrigins === undefined ||
      (Array.isArray(allowedOrigins) && allowedOrigins.every((origin) => typeof origin === "string"))
    );
}

export function normalizeSession(value: unknown): Session | null {
  if (!isStoredSession(value)) {return null;}

  return {
    port: value.port,
    token: value.token,
    showLog: value.showLog ?? false,
    workspaceId: value.workspaceId ?? "global",
    allowedOrigins: value.allowedOrigins,
  };
}

export function isSiteSelectors(value: unknown): value is SiteSelectors {
  return isRecord(value) &&
    typeof value.messageBlocks === "string" &&
    typeof value.codeBlocks === "string" &&
    typeof value.inputArea === "string" &&
    typeof value.sendButton === "string" &&
    typeof value.stopButton === "string" &&
    (
      value.maxInlineChars === undefined ||
      typeof value.maxInlineChars === "number"
    );
}

export function isSyncedAiSite(value: unknown): value is SyncedAiSite {
  return isRecord(value) &&
    typeof value.address === "string" &&
    (
      value.name === undefined ||
      typeof value.name === "string"
    );
}

export function getSyncedAiSites(value: unknown): SyncedAiSite[] {
  return Array.isArray(value) ? value.filter(isSyncedAiSite) : [];
}
