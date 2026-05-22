import { type Session, type ToolExecutionPayload } from '@webcode/shared';

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
  payload?: ToolExecutionPayload;
}

export interface HandshakeResponse {
  success: boolean;
  error?: string;
  conflictTabId?: string;
}

export interface RuntimeContextResponse {
  success: boolean;
  current_time_iso: string;
  current_time_local: string;
  time_zone: string;
  browser_window_focused: boolean | null;
  browser_window_in_background: boolean | null;
  tab_active: boolean | null;
  window_id: number | null;
  tab_id: number | null;
  document_visibility_state?: string;
  document_hidden?: boolean;
  error?: string;
}
