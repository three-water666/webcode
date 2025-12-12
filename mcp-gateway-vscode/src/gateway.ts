import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// @ts-ignore: We intentionally import the deprecated SSE transport for backward compatibility
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { ToolExecutionPayload } from '@webmcp/shared';

const RUN_IN_TERMINAL_TOOL = {
    name: "run_in_terminal",
    description: "Execute a command in the VS Code integrated terminal. Use this for long-running processes (e.g., 'npm start', 'python server.py') or when you want the user to see the output in real-time. Returns immediately after sending the command.",
    inputSchema: {
        type: "object",
        properties: {
            command: { type: "string", description: "The command to execute" },
            auto_focus: { type: "boolean", description: "Focus the terminal after sending the command", default: true }
        },
        required: ["command"]
    }
};

const GET_TOOL_DEFINITIONS_TOOL = {
    name: "get_tool_definitions",
    description: "Fetch detailed schemas for tools that are in 'Summary Mode'. Use this when you need to use a tool but its inputSchema is hidden.",
    inputSchema: {
        type: "object",
        properties: {
            tool_names: {
                type: "array",
                items: { type: "string" },
                description: "List of tool names to fetch definitions for (e.g. ['git_commit', 'git_status'])"
            }
        },
        required: ["tool_names"]
    }
};

// Tools that always show full schema (Hot Tools)
const BASIC_TOOLS = [
    'read_file', 'read_text_file', 'write_file', 'edit_file', 
    'list_directory', 'list_directory_with_sizes', 
    'run_in_terminal', 'execute_command', 
    'search_files', 'get_tool_definitions', 'list_tools'
];

// 定义服务器配置接口
interface ServerConfig {
    type?: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    disabled?: boolean;
}

interface Config {
    port: number;
    preferredPort?: number;
    mcpServers: Record<string, ServerConfig>;
    allowedOrigins: string[]; // [Security] Whitelist for CORS
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
    private extensionPath: string;
    private context: vscode.ExtensionContext;
    private authToken: string = '';
    private watchdogTimer: NodeJS.Timeout | null = null;
    private readonly WATCHDOG_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    private onAutoStop: (() => void) | null = null;

    constructor(outputChannel: vscode.OutputChannel, extensionPath: string, context: vscode.ExtensionContext, onAutoStop?: () => void) {
        this.outputChannel = outputChannel;
        this.extensionPath = extensionPath;
        this.context = context;
        this.onAutoStop = onAutoStop || null;
        // [Persistence] Generate token once per VS Code session
        this.authToken = crypto.randomUUID();
    }

    private resetWatchdog() {
        if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
        this.watchdogTimer = setTimeout(() => {
            this.log('💤 No activity for 30 minutes. Shutting down...');
            this.stop();
            if (this.onAutoStop) this.onAutoStop();
        }, this.WATCHDOG_TIMEOUT);
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
            if (config.disabled === true) {
                this.log(`   -> Skipping [${serverId}] (Disabled)`);
                continue;
            }

            try {
                let client: Client;

                if (config.type === 'http') {
                    if (!config.url) throw new Error("Missing 'url' for HTTP config");
                    this.log(`   -> Connecting [${serverId}] via HTTP (Standard): ${config.url}`);
                    
                    // 标准 HTTP 传输 (新版)
                    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
                        requestInit: { headers: config.headers },
                    });
                    client = new Client({ name: "mcp-gateway-vscode", version: "1.0.0" }, { capabilities: {} });
                    await client.connect(transport);
                
                } else if (config.type === 'sse') {
                    if (!config.url) throw new Error("Missing 'url' for SSE config");
                    this.log(`   -> Connecting [${serverId}] via SSE (Legacy): ${config.url}`);
                    
                    // SSE 传输 (旧版，向后兼容)
                    const transport = new SSEClientTransport(new URL(config.url), {
                        requestInit: { headers: config.headers } as any, // 强制类型转换以应对弃用API的严格类型
                        // @ts-ignore
                        eventSourceInit: { headers: config.headers },
                    });
                    client = new Client({ name: "mcp-gateway-vscode", version: "1.0.0" }, { capabilities: {} });
                    await client.connect(transport);
                
                } else {
                    // Default to Stdio
                    // [Fix] Resolve variable substitution for ${extensionPath}
                    const replaceVars = (str: string) => str.replace(/\$\{extensionPath\}/g, this.extensionPath);

                    let command = replaceVars(config.command!);
                    let args = (config.args || []).map(arg => replaceVars(arg));
                    const env = { ...process.env, ...config.env } as Record<string, string>;

                    if (process.platform === 'win32') {
                        if (command === 'npx' || command === 'npm') command = `${command}.cmd`;
                    }

                    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
                        args = args.map(arg => {
                            if (arg === '.' || arg === '${workspaceFolder}') return root;
                            return arg;
                        });
                    }

                    this.log(`   -> Starting [${serverId}]: ${command} ${args.join(' ')}`);
                    const transport = new StdioClientTransport({ command, args, env });
                    client = new Client({ name: "mcp-gateway-vscode", version: "1.0.0" }, { capabilities: {} });
                    await client.connect(transport);
                }

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

        // 1. 使用持久化 Token (仅首次生成)
        if (!this.authToken) this.authToken = crypto.randomUUID();
        // this.log(`🔐 Security Token: ${this.authToken}`); // Reduce noise on restart

        // Start Watchdog
        this.resetWatchdog();

        this.app = express();
        this.app.use(express.json());

        // 2. 安全 CORS 配置 (Origin Whitelisting)
        this.app.use(cors({
            origin: (origin, callback) => {
                // 允许无 Origin 的请求 (如浏览器直接访问 /bridge，或非浏览器工具)
                if (!origin) return callback(null, true);

                // [Fix] 允许浏览器扩展自身访问 (Origin: chrome-extension://[ID])          
                if (origin.startsWith('chrome-extension://')) return callback(null, true);

                // 检查是否在白名单中
                if (config.allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }

                // 允许 localhost (开发调试用)
                if (origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost')) {
                    return callback(null, true);
                }

                this.log(`⛔ Blocked CORS request from: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        }));

        // 3. 日志与看门狗中间件
        this.app.use((req, res, next) => {
            this.resetWatchdog(); // Keep alive on any request
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

        // 4.1 配置同步接口 (Config Sync)
        this.app.get('/v1/config', (req, res) => {
            this.log('📥 Config Sync: Pull requested');
            const savedConfig = this.context.globalState.get('mcp.browserConfig') || null;
            res.json({ config: savedConfig });
        });

        this.app.post('/v1/config', (req, res) => {
            const newConfig = req.body.config;
            if (newConfig) {
                this.context.globalState.update('mcp.browserConfig', newConfig);
                this.log('📤 Config Sync: Push received & saved');
                res.json({ success: true });
            } else {
                res.status(400).json({ error: "Missing config data" });
            }
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
            const payload = req.body as ToolExecutionPayload;
            let { name, arguments: args } = payload;
            const toolStart = Date.now();

            // Auto-resolve relative paths for local filesystem tools
            // [Fix v2] Use Allowlist instead of Blocklist to avoid matching remote tools like 'get_file_contents'
            const localPathTools = [
                'read_file', 'read_text_file', 'read_multiple_files', 'write_file', 'edit_file', 'append_file',
                'list_directory', 'list_directory_with_sizes', 'directory_tree',
                'move_file', 'search_files', 'get_file_info', 'create_directory',
                'execute_command', 'run_in_terminal' // Built-in tools
            ];
            // Git tools also operate on local filesystem
            const isLocalTool = localPathTools.includes(name) || name.startsWith('git_');

            if (isLocalTool && args && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fixPath = (p: string) => {
                    if (typeof p === 'string' && !path.isAbsolute(p)) {
                        return path.join(root, p);
                    }
                    return p;
                };

                if (args.path) args.path = fixPath(args.path);
                if (args.cwd) args.cwd = fixPath(args.cwd); // Fix: Resolve CWD for execute_command
                if (args.repo_path) args.repo_path = fixPath(args.repo_path); // Fix: Support relative path for Git tools
                if (args.source) args.source = fixPath(args.source);
                if (args.destination) args.destination = fixPath(args.destination);
                if (Array.isArray(args.paths)) args.paths = args.paths.map((p: any) => fixPath(p));
            }

            if (name === 'list_tools') {
                const rawTools = Array.from(this.toolRouter.values()).map(t => t.definition);
                rawTools.push(RUN_IN_TERMINAL_TOOL); // Inject internal tool
                rawTools.push(GET_TOOL_DEFINITIONS_TOOL); // Inject internal tool

                // De-duplicate
                const uniqueTools = [...new Map(rawTools.map(item => [item.name, item])).values()];

                // Apply Lazy Loading Logic
                const optimizedTools = uniqueTools.map(tool => {
                    // If it's a Basic Tool, return as is
                    if (BASIC_TOOLS.includes(tool.name)) {
                        return tool;
                    }
                    // Otherwise, hide schema (Lazy Tool)
                    return {
                        name: tool.name,
                        description: tool.description + " [Schema Hidden] Call 'get_tool_definitions' to retrieve usage.",
                        inputSchema: {
                            type: "object",
                            properties: {},
                            description: "SCHEMA_HIDDEN_FOR_PERFORMANCE"
                        }
                    };
                });

                this.log(`   🚀 Executing: list_tools (Internal) - Optimized ${optimizedTools.length} tools`);
                this.log(`   ✅ Finished: list_tools (0ms)`);
                return res.json({
                    content: [{ type: 'text', text: JSON.stringify(optimizedTools, null, 2) }],
                    isError: false
                });
            }

            if (name === 'run_in_terminal') {
                this.log(`   🚀 Executing: run_in_terminal ${args.command}`);
                const termName = 'WebMCP';
                let terminal = vscode.window.terminals.find(t => t.name === termName);
                if (!terminal) {
                    terminal = vscode.window.createTerminal(termName);
                }
                if (args.auto_focus !== false) {
                    terminal.show();
                }
                terminal.sendText(args.command);
                
                this.log(`   ✅ Finished: run_in_terminal (Async dispatch)`);
                return res.json({
                    content: [{ type: 'text', text: `Command sent to terminal '${termName}': ${args.command}` }],
                    isError: false
                });
            }

            if (name === 'get_tool_definitions') {
                const requestedNames = args.tool_names as string[] || [];
                this.log(`   🚀 Executing: get_tool_definitions for [${requestedNames.join(', ')}]`);
                
                const definitions = [];
                // 1. Check Tool Router
                for (const tName of requestedNames) {
                    if (this.toolRouter.has(tName)) {
                        definitions.push(this.toolRouter.get(tName)!.definition);
                    } else if (tName === 'run_in_terminal') {
                        definitions.push(RUN_IN_TERMINAL_TOOL);
                    } else if (tName === 'get_tool_definitions') {
                        definitions.push(GET_TOOL_DEFINITIONS_TOOL);
                    }
                }

                this.log(`   ✅ Finished: get_tool_definitions (Found ${definitions.length}/${requestedNames.length})`);
                return res.json({
                    content: [{ type: 'text', text: JSON.stringify(definitions, null, 2) }],
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
        if (this.watchdogTimer) {
            clearTimeout(this.watchdogTimer);
            this.watchdogTimer = null;
        }
        if (this.server) {
            this.server.close();
            this.server = null;
            // [Persistence] Do NOT clear authToken here
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