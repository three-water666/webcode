// 通用通信协议定义

import brandConfig from './branding.json';

function toHeaderToken(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export const BRANDING = {
  productName: brandConfig.productName,
  slug: brandConfig.slug,
  gatewayName: `${brandConfig.productName} gateway`,
  bridgeName: `${brandConfig.productName} bridge`,
  settingsName: `${brandConfig.productName} Settings`,
  managerName: `${brandConfig.productName} Manager`,
  serverName: `${brandConfig.productName} Server`,
  notificationName: `${brandConfig.productName} Notification`,
  terminalPrefix: brandConfig.productName,
  resultFilePrefix: `${brandConfig.slug}-result`,
  logPrefix: `[${brandConfig.productName}]`,
  slashCommand: `/${brandConfig.slug}`,
  mentionCommand: `@${brandConfig.slug}`,
  repositoryUrl: brandConfig.repositoryUrl,
} as const;

const headerToken = toHeaderToken(brandConfig.productName);

export const PROTOCOL = {
  initToolName: `${brandConfig.slug}_init`,
  authHeaderName: `X-${headerToken}-Token`,
  authHeaderLowerName: `x-${headerToken.toLowerCase()}-token`,
  observerStartedFlag: `_${brandConfig.slug}_observer_started`,
} as const;

export const BOOTSTRAP_ONLY_TOOL_NAMES = [
  'get_project_rules',
  'list_tools',
  'list_skills',
] as const;

export type BootstrapOnlyToolName = typeof BOOTSTRAP_ONLY_TOOL_NAMES[number];

export function isBootstrapOnlyToolName(name: string): name is BootstrapOnlyToolName {
  return (BOOTSTRAP_ONLY_TOOL_NAMES as readonly string[]).includes(name);
}

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
  workspaceId: string;
  allowedOrigins?: string[];
}
