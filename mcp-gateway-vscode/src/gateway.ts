import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';

// 定义服务器配置接口
interface ServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}

interface Config {
    port: number;
    preferredPort?: number;
    mcpServers: Record<string, ServerConfig>;
}

interface StartResult {
    port: number;
    token: string;
}

export class GatewayManager {
    private app: express.Express | null = null;
    private server: any = null;
    private toolRouter = new Map<string, { client: Client; definition: any }>();
    private connectedClients: { id: string; client: Client }[] = [];
    private outputChannel: vscode.OutputChannel;
    private authToken: string = '';

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

    // 修改：返回 {port, token}
    async start(config: Config): Promise<StartResult> {
        if (this.server) {
            await this.stop();
        }
        await this.connectToServers(config.mcpServers);

        // 1. 生成一次性 Token
        this.authToken = crypto.randomUUID();
        this.log(`🔐 Security Token Generated: ${this.authToken}`);

        this.app = express();
        this.app.use(express.json());
        
        // 2. 允许所有 CORS (依赖 Token 鉴权)
        this.app.use(cors({ origin: '*' }));

        // 3. 日志中间件
        this.app.use((req, res, next) => {
            const start = Date.now();
            if (req.method !== 'OPTIONS') {
                this.log(`🔔 [${req.method}] ${req.url}`);
            }
            res.on('finish', () => {
                const duration = Date.now() - start;
                if (req.method !== 'OPTIONS') {
                    const icon = res.statusCode >= 400 ? '❌' : '   🏁';
                    this.log(`${icon} Status: ${res.statusCode} (${duration}ms)`);
                }
            });
            next();
        });

        // 4. Token 校验中间件 (排除 /bridge 和 OPTIONS)
        this.app.use((req, res, next) => {
            if (req.path === '/bridge' || req.path === '/favicon.ico' || req.method === 'OPTIONS') {
                return next();
            }

            const clientToken = req.headers['x-webmcp-token'];
            if (!clientToken || clientToken !== this.authToken) {
                this.log(`⛔ Unauthorized access attempt. Token: ${clientToken}`);
                return res.status(403).json({ 
                    isError: true, 
                    content: [{ type: 'text', text: "⛔ Forbidden: Invalid Security Token. Please launch from VS Code." }]
                });
            }
            next();
        });

        // 5. 桥接页面 (Bridge Page)
        this.app.get('/bridge', (req, res) => {
            const target = req.query.target as string || 'https://chatgpt.com';
            const token = req.query.token as string;
            const port = this.server.address().port;
            
            this.log(`🌉 Bridge handshake requested.`);
            
            // 返回中转页，包含必要的元数据
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WebMCP Bridge</title>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #1e1e1e; color: #fff; text-align: center; }
                        .loader { border: 3px solid #333; border-top: 3px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
                        .card { background: #252526; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); max-width: 400px; }
                        h2 { margin-top: 0; color: #3498db; }
                        p { color: #cccccc; }
                        .warn { color: #e67e22; font-size: 0.9em; margin-top: 10px; }
                        button { background: #3498db; border: none; padding: 10px 20px; color: white; border-radius: 4px; cursor: pointer; margin-top: 15px; }
                        button:hover { background: #2980b9; }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    </style>
                </head>
                <body>
                    <div class="card" id="main-card">
                        <div class="loader" id="loader"></div>
                        <h2>Connecting to WebMCP...</h2>
                        <p>Synchronizing with VS Code...</p>
                    </div>

                    
                    <div id="mcp-data" data-port="${port}" data-token="${token}" data-target="${target}" style="display:none;"></div>
                    
                    
                    <div class="card" id="install-guide" style="display:none; border: 1px solid #e74c3c; box-shadow: 0 4px 15px rgba(231, 76, 60, 0.2);">
                        <h2 style="color:#e74c3c; margin-bottom:10px">⚠️ Extension Required</h2>
                        <p style="margin-bottom:20px">To enable auto-connection, you need the companion browser extension:</p>
                        <div style="background:#333; padding:10px; border-radius:6px; margin-bottom:20px; font-weight:bold; color:#fff">
                            🧩 WebMCP Bridge
                        </div>
                        <a href="#" onclick="alert('Please search for [WebMCP Bridge] in your browser store.'); return false;" style="display:inline-block; background:#e74c3c; color:white; padding:10px 20px; text-decoration:none; border-radius:4px; font-weight:bold;">
                            Get Browser Extension
                        </a>
                        <p class="warn" style="margin-top:15px; font-size:12px">Already installed? Try reloading this page.</p>
                    </div>

                    <script>
                        // 检测逻辑：等待 1.5 秒
                        setTimeout(() => {
                            // 1. 检查插件是否打上了标记
                            const isInstalled = document.documentElement.getAttribute('data-extension-installed') === 'true';
                            
                            // 2. 双重保险：检查页面内容是否已经被插件修改（例如出现了冲突提示）
                            const bodyText = document.body.innerText;
                            const isBusyOrConflict = bodyText.includes('Conflict') || bodyText.includes('Switching') || bodyText.includes('Connected');

                            // 只有在既没安装，也没发生冲突的情况下，才显示安装引导
                            if (!isInstalled && !isBusyOrConflict) {
                                document.getElementById('main-card').style.display = 'none';
                                document.getElementById('install-guide').style.display = 'block';
                            }
                        }, 1500);
                    </script>
                </body>
                </html>
            `);
        });

        this.app.get('/v1/tools', (req, res) => {
            const tools = Array.from(this.toolRouter.values()).map(t => t.definition);
            this.log(`   🚀 Executing: GET /v1/tools (Discovery)`);
            res.json({ tools });
        });

        this.app.post('/v1/tools/call', async (req, res) => {
            let { name, arguments: args } = req.body;
            const toolStart = Date.now();

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

            if (name === 'list_tools') {
                const tools = Array.from(this.toolRouter.values()).map(t => t.definition);
                const uniqueTools = [...new Map(tools.map(item => [item.name, item])).values()];
                this.log(`   🚀 Executing: list_tools (Internal)`);
                this.log(`   ✅ Finished: list_tools (0ms)`);
                return res.json({
                    content: [{ type: 'text', text: JSON.stringify(uniqueTools, null, 2) }],
                    isError: false
                });
            }

            const route = this.toolRouter.get(name);
            if (!route) {
                return res.status(404).json({
                    isError: true,
                    content: [{ type: 'text', text: `Tool '${name}' not found.` }]
                });
            }

            try {
                const argsPreview = JSON.stringify(args || {}).slice(0, 50) + '...';
                this.log(`   🚀 Executing: ${name} ${argsPreview}`);
                const result = await route.client.callTool({ name, arguments: args || {} });
                const toolDuration = Date.now() - toolStart;
                this.log(`   ✅ Finished: ${name} (${toolDuration}ms)`);
                res.json(result);
            } catch (error: any) {
                this.error(`Tool execution failed: ${name}`, error);
                res.status(500).json({
                    isError: true,
                    content: [{ type: 'text', text: `Error: ${error.message}` }]
                });
            }
        });

        // Dynamic Port Allocation
        return new Promise<StartResult>((resolve, reject) => {
            const tryListen = (currentPort: number, attempt: number) => {
                const maxRetries = 20;
                if (attempt > maxRetries) {
                    reject(new Error("No ports available"));
                    return;
                }

                this.server = this.app!.listen(currentPort, '127.0.0.1', () => {
                    this.log(`🌐 Gateway running on http://127.0.0.1:${currentPort} (Token: ${this.authToken.slice(0, 8)}...)`);
                    vscode.window.setStatusBarMessage(`MCP Gateway: On (${currentPort})`, 5000);
                    resolve({ port: currentPort, token: this.authToken });
                });

                this.server.on('error', (e: any) => {
                    if (e.code === 'EADDRINUSE') {
                        // Fix: Prevent infinite loop if preferredPort equals config.port
                        if (config.preferredPort && currentPort === config.preferredPort && currentPort !== config.port) {
                             this.log(`⚠️ Preferred port ${currentPort} busy. Falling back to default range.`);
                             tryListen(config.port, 0);
                        } else {
                             tryListen(currentPort + 1, attempt + 1);
                        }
                    } else {
                        reject(e);
                    }
                });
            };

            if (config.preferredPort && config.preferredPort !== config.port) {
                 tryListen(config.preferredPort, 0);
            } else {
                 tryListen(config.port, 0);
            }
        });
    }

    async stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.authToken = '';
            this.log('🛑 Gateway server stopped.');
        }
        this.connectedClients.forEach(c => {
            try {
                c.client.close();
            } catch (e) { }
        });
        this.connectedClients = [];
    }
}