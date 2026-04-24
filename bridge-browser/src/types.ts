import { Session, ToolExecutionPayload } from '@webcode/shared';

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
  payload?: ToolExecutionPayload;
}

export interface HandshakeResponse {
  success: boolean;
  error?: string;
  conflictTabId?: string;
}
