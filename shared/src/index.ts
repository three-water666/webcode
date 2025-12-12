// 通用通信协议定义

/**
 * 工具执行请求载荷
 * 用于 Browser -> Extension -> Gateway 的链路
 */
export interface ToolExecutionPayload {
  name: string;
  arguments: any;
  request_id?: string;
  purpose?: string;
}

/**
 * MCP 响应标准格式
 */
export interface McpResponse {
  mcp_action: 'result';
  request_id: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
  system_note?: string;
}

/**
 * 会话连接信息
 */
export interface Session {
  port: number;
  token: string;
  showLog: boolean;
}
