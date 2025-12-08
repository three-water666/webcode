import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as vscode from 'vscode';
import * as path from 'path';

// 定义服务器配置接口
interface ServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}

interface Config {
    mcpServers: Record<string, ServerConfig>;
}

export class GatewayManager {
    private toolRouter = new Map<string, { client: Client; definition: any }>();
    private connectedClients: { id: string; client: Client }[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel, extensionPath: string) {
        this.outputChannel = outputChannel;
    }

    private log(message: string) {
        const now = new Date();
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        this.outputChannel.appendLine(`[${time}] ${message}`);
    }

    private error(message: string, err?: any) {
        const now = new Date();
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        this.outputChannel.appendLine(`[${time}] ❌ ${message} ${err ? (err.message || JSON.stringify(err)) : ''}`);
    }

    async connectToServers(servers: Record<string, ServerConfig>) {
        this.connectedClients.forEach(c => {
            try {
                c.client.close();
            } catch (e) { }
        });
        this.connectedClients = [];
        this.toolRouter.clear();

        this.log('🔌 Connecting to MCP servers...');

        for (const [serverId, config] of Object.entries(servers)) {
            try {
                let command = config.command;
                let args = [...config.args];
                const env = { ...process.env, ...config.env } as Record<string, string>;

                if (process.platform === 'win32') {
                    if (command === 'npx' || command === 'npm') {
                        command = `${command}.cmd`;
                    }
                }

                if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
                    args = args.map(arg => {
                        if (arg === '.' || arg === '${workspaceFolder}') {
                            return root;
                        }
                        return arg;
                    });
                }

                this.log(`   -> Starting [${serverId}]: ${command} ${args.join(' ')}`);

                const transport = new StdioClientTransport({
                    command, args, env
                });

                const client = new Client(
                    { name: "mcp-gateway-vscode", version: "1.0.0" },
                    { capabilities: {} }
                );

                await client.connect(transport);
                this.connectedClients.push({ id: serverId, client });

                const list = await client.listTools();
                this.log(`   ✅ [${serverId}] Connected. Loaded ${list.tools.length} tools.`);

                list.tools.forEach((tool) => {
                    if (this.toolRouter.has(tool.name)) {
                        this.log(`   ⚠️ Warning: Tool '${tool.name}' overridden by ${serverId}.`);
                    }
                    this.toolRouter.set(tool.name, { client, definition: tool });
                });

            } catch (err) {
                this.error(`Failed to connect to [${serverId}]`, err);
            }
        }
    }

    // === 公开的工具执行方法 (核心接口) ===
    public async executeTool(name: string, args: any = {}): Promise<any> {
        const toolStart = Date.now();

        // 路径自动修复逻辑
        if (args && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const fixPath = (p: string) => {
                if (typeof p === 'string' && !path.isAbsolute(p)) {
                    return path.join(root, p);
                }
                return p;
            };

            if (args.path) args.path = fixPath(args.path);
            if (args.source) args.source = fixPath(args.source);
            if (args.destination) args.destination = fixPath(args.destination);
            if (Array.isArray(args.paths)) args.paths = args.paths.map((p: any) => fixPath(p));
        }

        // 内置工具：list_tools
        if (name === 'list_tools') {
            const tools = Array.from(this.toolRouter.values()).map(t => t.definition);
            const uniqueTools = [...new Map(tools.map(item => [item.name, item])).values()];
            this.log(`   🚀 Executing: list_tools (Internal)`);
            return {
                content: [{ type: 'text', text: JSON.stringify(uniqueTools, null, 2) }],
                isError: false
            };
        }

        // 查找工具
        const route = this.toolRouter.get(name);
        if (!route) {
            throw new Error(`Tool '${name}' not found.`);
        }

        // 执行工具
        const argsPreview = JSON.stringify(args).slice(0, 50) + '...';
        this.log(`   🚀 Executing: ${name} ${argsPreview}`);
        const result = await route.client.callTool({ name, arguments: args });
        const toolDuration = Date.now() - toolStart;
        this.log(`   ✅ Finished: ${name} (${toolDuration}ms)`);
        return result;
    }

    async start(config: Config) {
        await this.connectToServers(config.mcpServers);
        this.log('✅ Gateway Ready (Native Mode)');
    }

    async stop() {
        this.connectedClients.forEach(c => {
            try {
                c.client.close();
            } catch (e) { }
        });
        this.connectedClients = [];
        this.log('🛑 Gateway stopped.');
    }
}