import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { BRANDING, PROTOCOL, type ToolExecutionPayload } from '@webcode/shared';
import { PROMPTS } from './defaults';
import { getDefaultBridgeTarget, getDefaultSelectors, getPlatformIdByAddress } from './platforms';
import { SkillManager } from './skillManager';
import { TerminalSessionManager } from './terminalSessionManager';
import {
    formatToolArgumentValidationError,
    validateToolArguments
} from './schemaValidation';
import {
    createLocalToolMap,
    type LocalTool,
    type ToolDefinition,
    type ToolExecutionContext
} from './tools';

const BUILTIN_SELECTORS = getDefaultSelectors();

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
    aiSites?: any[]; // Dynamic sites from config
    skillDirectories?: string[];
    commandShellPath?: string;
}

interface StartResult {
    port: number;
    token: string;
}

export class GatewayManager {
    private app: express.Express | null = null;
    private server: any = null;
    private toolRouter = new Map<string, { client: Client; definition: ToolDefinition; serverId: string }>();
    private connectedClients: { id: string; client: Client }[] = [];
    private localTools: Map<string, LocalTool> = createLocalToolMap();

    // Helper: Generate grouped tool list
    private _generateGroupedTools() {
        // 1. Gather all tools with their server association
        const allTools = Array.from(this.toolRouter.values()).map(t => ({ ...t.definition, _server: t.serverId }));

        // 2. Inject local VS Code tools
        for (const tool of this.localTools.values()) {
            allTools.push({ ...tool.definition, _server: tool.serverId ?? 'internal' });
        }

        // 3. Group by Server
        const groups: Record<string, { tools: any[] }> = {};

        allTools.forEach(tool => {
            const server = tool._server ?? 'unknown';
            if (!groups[server]) {
                groups[server] = { tools: [] };
            }

            const { _server, ...cleanTool } = tool;
            groups[server].tools.push(cleanTool);
        });

        // 4. Transform to Array format
        return Object.entries(groups).map(([server, data]) => ({
            server,
            tools: data.tools.sort((a, b) => a.name.localeCompare(b.name))
        }));
    }

    private getToolDefinition(name: string): ToolDefinition | null {
        return this.localTools.get(name)?.definition ?? this.toolRouter.get(name)?.definition ?? null;
    }
    private outputChannel: vscode.OutputChannel;
    private extensionPath: string;
    private context: vscode.ExtensionContext;
    private authToken: string = '';
    private watchdogTimer: NodeJS.Timeout | null = null;
    private readonly WATCHDOG_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    private onAutoStop: (() => void) | null = null;
    private skillManager: SkillManager;
    private terminalSessionManager: TerminalSessionManager;
    private skillDirectories: string[] = [];
    private commandShellPath: string | undefined;

    constructor(outputChannel: vscode.OutputChannel, extensionPath: string, context: vscode.ExtensionContext, onAutoStop?: () => void) {
        this.outputChannel = outputChannel;
        this.extensionPath = extensionPath;
        this.context = context;
        this.onAutoStop = onAutoStop ?? null;
        this.skillManager = new SkillManager(outputChannel);
        this.terminalSessionManager = new TerminalSessionManager(outputChannel);
        // [Persistence] Generate token once per VS Code session
        this.authToken = crypto.randomUUID();
    }

    private resetWatchdog() {
        if (this.watchdogTimer) {clearTimeout(this.watchdogTimer);}
        this.watchdogTimer = setTimeout(() => {
            this.log('💤 No activity for 30 minutes. Shutting down...');
            this.stop();
            if (this.onAutoStop) {this.onAutoStop();}
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
        this.outputChannel.appendLine(`[${time}] ❌ ${message} ${err ? (err.message ?? JSON.stringify(err)) : ''}`);
    }

    invalidateSkillCache(reason?: string) {
        this.skillManager.invalidateCache(reason);
    }

    private getPrimaryWorkspaceRoot(): string | null {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    }

    private createToolExecutionContext(): ToolExecutionContext {
        return {
            workspaceRoot: this.getPrimaryWorkspaceRoot(),
            outputChannel: this.outputChannel,
            skillManager: this.skillManager,
            terminalSessionManager: this.terminalSessionManager,
            skillDirectories: this.skillDirectories,
            commandShellPath: this.commandShellPath,
            listTools: () => this._generateGroupedTools(),
            getToolDefinition: (name: string) => this.getToolDefinition(name)
        };
    }

    async connectToServers(servers: Record<string, ServerConfig>) {
        this.connectedClients.forEach(c => {
            try {
                c.client.close();
            } catch { }
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
                    if (!config.url) {throw new Error("Missing 'url' for HTTP config");}
                    this.log(`   -> Connecting [${serverId}] via HTTP (Standard): ${config.url}`);
                    
                    // 标准 HTTP 传输 (新版)
                    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
                        requestInit: { headers: config.headers },
                    });
                    client = new Client({ name: "gateway-vscode", version: "1.0.0" }, { capabilities: {} });
                    await client.connect(transport);
                
                } else if (config.type === 'sse') {
                    if (!config.url) {throw new Error("Missing 'url' for SSE config");}
                    this.log(`   -> Connecting [${serverId}] via SSE (Legacy): ${config.url}`);
                    
                    // SSE 传输 (旧版，向后兼容)
                    const transport = new SSEClientTransport(new URL(config.url), {
                        requestInit: { headers: config.headers } as any, // 强制类型转换以应对弃用API的严格类型
                        // @ts-expect-error: Deprecated SSE EventSource typings do not expose custom headers.
                        eventSourceInit: { headers: config.headers },
                    });
                    client = new Client({ name: "gateway-vscode", version: "1.0.0" }, { capabilities: {} });
                    await client.connect(transport);
                
                } else {
                    // Default to Stdio
                    // [Fix] Resolve variable substitution for ${extensionPath}
                    const replaceVars = (str: string) => str.replace(/\$\{extensionPath\}/g, this.extensionPath);

                    let command = replaceVars(config.command ?? "");
                    let args = (config.args ?? []).map(arg => replaceVars(arg));
                    const env = { ...process.env, ...config.env } as Record<string, string>;

                    if (process.platform === 'win32') {
                        if (command === 'npx' || command === 'npm') {command = `${command}.cmd`;}
                    }

                    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
                        args = args.map(arg => {
                            if (arg === '.' || arg === '${workspaceFolder}') {return root;}
                            return arg;
                        });
                    }

                    this.log(`   -> Starting [${serverId}]: ${command} ${args.join(' ')}`);
                    const transport = new StdioClientTransport({ command, args, env });
                    client = new Client({ name: "gateway-vscode", version: "1.0.0" }, { capabilities: {} });
                    await client.connect(transport);
                }

                this.connectedClients.push({ id: serverId, client });

                const list = await client.listTools();
                this.log(`   ✅ [${serverId}] Connected. Loaded ${list.tools.length} tools.`);

                list.tools.forEach((tool) => {
                    if (this.toolRouter.has(tool.name)) {
                        this.log(`   ⚠️ Warning: Tool '${tool.name}' overridden by ${serverId}.`);
                    }
                    this.toolRouter.set(tool.name, { client, definition: tool as ToolDefinition, serverId });
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
        this.skillDirectories = config.skillDirectories ?? [];
        const commandShellPath = config.commandShellPath?.trim();
        this.commandShellPath = commandShellPath === '' ? undefined : commandShellPath;
        await this.connectToServers(config.mcpServers);

        // 1. 使用持久化 Token (仅首次生成)
        if (!this.authToken) {this.authToken = crypto.randomUUID();}
        // this.log(`🔐 Security Token: ${this.authToken}`); // Reduce noise on restart

        // Start Watchdog
        this.resetWatchdog();

        this.app = express();
        this.app.use(express.json());

        // 2. 安全 CORS 配置 (Origin Whitelisting)
        this.app.use(cors({
            origin: (origin, callback) => {
                // 允许无 Origin 的请求 (如浏览器直接访问 /bridge，或非浏览器工具)
                if (!origin) {return callback(null, true);}

                // [Fix] 允许浏览器扩展自身访问 (Origin: chrome-extension://[ID])          
                if (origin.startsWith('chrome-extension://')) {return callback(null, true);}

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

            const rawClientToken = req.headers[PROTOCOL.authHeaderLowerName];
            const clientToken = Array.isArray(rawClientToken) ? rawClientToken[0] : rawClientToken;
            if (!clientToken || clientToken !== this.authToken) {
                this.log(`⛔ Unauthorized access attempt. Token: ${clientToken ?? '<missing>'}`);
                return res.status(403).json({
                    isError: true,
                    content: [{ type: 'text', text: "⛔ Forbidden: Invalid Security Token. Please launch from VS Code." }]
                });
            }
            next();
        });

        // 4.1 核心配置与协议下发接口 (Initialization)
        this.app.get('/v1/init', (req, res) => {
            this.log('📥 Init Sync: Browser requested default rules and prompts');

            // Generate syncedAiSites with merged selectors
            const syncedAiSites = (config.aiSites ?? []).map(site => {
                const platformId = getPlatformIdByAddress(site.address);
                const defaultSelectors = platformId ? BUILTIN_SELECTORS[platformId] ?? {} : {};

                return {
                    ...site,
                    selectors: { ...defaultSelectors, ...(site.selectors ?? {}) }
                };
            });

            res.json({
                syncedAiSites: syncedAiSites,
                prompts: PROMPTS
            });
        });

        // (Legacy) 保留 /v1/config 空接口，防止老版本插件因为找不到接口而报错
        this.app.get('/v1/config', (req, res) => {
            res.json({ config: null });
        });

        this.app.post('/v1/config', (req, res) => {
            res.json({ success: true });
        });

        // 5. 桥接页面 (Bridge Page)
        this.app.get('/bridge', (req, res) => {
            const target = req.query.target as string || getDefaultBridgeTarget();
            const token = req.query.token as string;
            const port = this.server.address().port;
            const releaseUrl = `${BRANDING.repositoryUrl}/releases`;

            // Generate Workspace ID based on the primary workspace folder
            let workspaceId = 'global';
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
                workspaceId = crypto.createHash('md5').update(rootPath).digest('hex').substring(0, 16);
            }

            this.log(`🌉 Bridge handshake requested for workspace [${workspaceId}].`);

            // 返回中转页，包含必要的元数据
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${BRANDING.bridgeName}</title>
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
                        <h2 id="bridge-title">Connecting to ${BRANDING.productName}...</h2>
                        <p id="bridge-status">Synchronizing with VS Code...</p>
                    </div>

                    <div id="mcp-data" data-port="${port}" data-token="${token}" data-target="${target}" data-workspace-id="${workspaceId}" style="display:none;"></div>

                    <div class="card" id="install-guide" style="display:none; border: 1px solid #e74c3c; box-shadow: 0 4px 15px rgba(231, 76, 60, 0.2);">
                        <h2 id="install-title" style="color:#e74c3c; margin-bottom:10px">⚠️ Extension Required</h2>
                        <p id="install-desc" style="margin-bottom:20px">To enable auto-connection, you need the companion browser extension:</p>
                        <div style="background:#333; padding:10px; border-radius:6px; margin-bottom:20px; font-weight:bold; color:#fff">
                            🧩 ${BRANDING.bridgeName}
                        </div>
                        <a id="install-button" href="${releaseUrl}" target="_blank" rel="noopener noreferrer" onclick="alert(window.__bridgeI18n?.installAlert || 'Please download the browser extension from GitHub Releases: ${releaseUrl}');" style="display:inline-block; background:#e74c3c; color:white; padding:10px 20px; text-decoration:none; border-radius:4px; font-weight:bold;">
                            Get Browser Extension
                        </a>
                        <p id="install-warn" class="warn" style="margin-top:15px; font-size:12px">Already installed? Try reloading this page.</p>
                    </div>

                    <script>
                        const isZh = navigator.language.toLowerCase().startsWith('zh');
                        const bridgeI18n = isZh ? {
                            connectingTitle: '正在连接 ${BRANDING.productName}...',
                            connectingStatus: '正在与 VS Code 同步...',
                            installTitle: '需要浏览器扩展',
                            installDesc: '要启用自动连接，您需要先安装配套的浏览器扩展：',
                            installButton: '前往下载浏览器扩展',
                            installWarn: '如果已经安装，请尝试刷新当前页面。',
                            installAlert: '请前往 GitHub Releases 下载浏览器插件：${releaseUrl}'
                        } : {
                            connectingTitle: 'Connecting to ${BRANDING.productName}...',
                            connectingStatus: 'Synchronizing with VS Code...',
                            installTitle: 'Browser Extension Required',
                            installDesc: 'To enable auto-connection, you need the companion browser extension:',
                            installButton: 'Download Browser Extension',
                            installWarn: 'Already installed? Try reloading this page.',
                            installAlert: 'Please download the browser extension from GitHub Releases: ${releaseUrl}'
                        };
                        window.__bridgeI18n = bridgeI18n;
                        document.getElementById('bridge-title').textContent = bridgeI18n.connectingTitle;
                        document.getElementById('bridge-status').textContent = bridgeI18n.connectingStatus;
                        document.getElementById('install-title').textContent = bridgeI18n.installTitle;
                        document.getElementById('install-desc').textContent = bridgeI18n.installDesc;
                        document.getElementById('install-button').textContent = bridgeI18n.installButton;
                        document.getElementById('install-warn').textContent = bridgeI18n.installWarn;

                        // 检测逻辑：等待 1.5 秒
                        setTimeout(() => {
                            // 1. 检查插件是否打上了标记
                            const isInstalled = document.documentElement.getAttribute('data-extension-installed') === 'true';

                            // 2. 双重保险：检查页面内容是否已经被插件修改（例如出现了冲突提示）
                            const bridgeState = document.body.dataset.bridgeState;
                            const isBusyOrConflict = bridgeState === 'conflict' || bridgeState === 'switching' || bridgeState === 'connected';

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

        this.app.post('/v1/tools/call', async (req, res) => {
            const payload = req.body as Partial<ToolExecutionPayload> | null;
            const toolStart = Date.now();

            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return res.status(400).json({
                    isError: true,
                    content: [{ type: 'text', text: 'Invalid tool call request: request body must be a JSON object.' }]
                });
            }

            if (typeof payload.name !== 'string' || payload.name.trim() === '') {
                return res.status(400).json({
                    isError: true,
                    content: [{ type: 'text', text: 'Invalid tool call request: "name" must be a non-empty string.' }]
                });
            }

            const name = payload.name;
            const rawArgs = payload.arguments ?? {};
            const toolDefinition = this.getToolDefinition(name);

            if (!toolDefinition) {
                return res.status(404).json({
                    isError: true,
                    content: [{ type: 'text', text: `Tool '${name}' not found.` }]
                });
            }

            const argumentErrors = validateToolArguments(rawArgs, toolDefinition.inputSchema);
            if (argumentErrors.length > 0) {
                const errorText = formatToolArgumentValidationError(name, toolDefinition.inputSchema, argumentErrors);
                this.log(`   ⛔ Rejected invalid arguments for ${name}: ${argumentErrors.join(' ')}`);
                return res.status(400).json({
                    isError: true,
                    content: [{ type: 'text', text: errorText }]
                });
            }

            const args = rawArgs as Record<string, any>;
            const localTool = this.localTools.get(name);
            if (localTool) {
                try {
                    const argsPreview = JSON.stringify(args ?? {}).slice(0, 80);
                    this.log(`   🚀 Executing local tool: ${name} ${argsPreview}`);
                    const result = await localTool.execute(args, this.createToolExecutionContext());
                    const toolDuration = Date.now() - toolStart;
                    this.log(`   ✅ Finished local tool: ${name} (${toolDuration}ms)`);
                    return res.json(result);
                } catch (error: any) {
                    this.error(`Local tool execution failed: ${name}`, error);
                    return res.status(500).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
            }

            // Auto-resolve relative paths for external MCP tools known to operate on local files.
            // [Fix v2] Use Allowlist instead of Blocklist to avoid matching remote tools like 'get_file_contents'
            const localPathTools = [
                'read_file', 'read_text_file', 'read_multiple_files', 'write_file', 'edit_file', 'append_file',
                'list_directory', 'list_directory_with_sizes', 'directory_tree',
                'move_file', 'search_files', 'get_file_info', 'create_directory'
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

                if (args.path) {args.path = fixPath(args.path);}
                if (args.cwd) {args.cwd = fixPath(args.cwd);} // Fix: Resolve CWD for execute_command
                if (args.repo_path) {args.repo_path = fixPath(args.repo_path);} // Fix: Support relative path for Git tools
                if (args.source) {args.source = fixPath(args.source);}
                if (args.destination) {args.destination = fixPath(args.destination);}
                if (Array.isArray(args.paths)) {args.paths = args.paths.map((p: any) => fixPath(p));}
            }

            const route = this.toolRouter.get(name);
            if (!route) {
                return res.status(404).json({
                    isError: true,
                    content: [{ type: 'text', text: `Tool '${name}' not found.` }]
                });
            }

            try {
                const argsPreview = JSON.stringify(args ?? {}).slice(0, 50) + '...';
                this.log(`   🚀 Executing: ${name} ${argsPreview}`);
                const result = await route.client.callTool({ name, arguments: args ?? {} });
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

                if (!this.app) {return;}
                this.server = this.app.listen(currentPort, '127.0.0.1', () => {
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

    // eslint-disable-next-line @typescript-eslint/require-await
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
            } catch { }
        });
        this.connectedClients = [];
    }
}
