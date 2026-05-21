import type * as vscode from 'vscode';

import type { ServerConfig } from '../gateway/types';

export type BuiltinServerConfig = ServerConfig;

const LEGACY_BUILTIN_SERVER_IDS = new Set(['filesystem', 'command', 'builtin_filesystem', 'builtin_command']);

export function filterCustomServers(
    servers: Record<string, BuiltinServerConfig>,
    output: vscode.OutputChannel
): Record<string, BuiltinServerConfig> {
    return Object.fromEntries(
        Object.entries(servers).filter(([serverId]) => {
            if (LEGACY_BUILTIN_SERVER_IDS.has(serverId)) {
                output.appendLine(
                    `[Builtin] Ignoring legacy built-in server config '${serverId}'. Built-in tools are implemented locally.`
                );
                return false;
            }
            return true;
        })
    );
}
