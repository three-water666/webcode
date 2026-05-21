import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import type { ToolDefinition } from '../tools';

export interface ServerConfig {
    type?: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    disabled?: boolean;
}

export interface AiSiteConfig {
    address: string;
    selectors?: Record<string, unknown>;
}

export type BuiltinSelectors = object;

export interface GatewayConfig {
    port: number;
    preferredPort?: number;
    mcpServers: Record<string, ServerConfig>;
    allowedOrigins: string[];
    aiSites?: AiSiteConfig[];
    skillDirectories?: string[];
    commandShellPath?: string;
}

export interface StartResult {
    port: number;
    token: string;
}

export type ConnectedClient = {
    id: string;
    client: Client;
};

export type RemoteToolRoute = {
    client: Client;
    definition: ToolDefinition;
    serverId: string;
    toolName: string;
};

export type GatewayLogger = (message: string) => void;
export type GatewayErrorLogger = (message: string, err?: unknown) => void;
