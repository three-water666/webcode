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
import { PROMPTS } from './defaults';
import { getDefaultBridgeTarget, getDefaultSelectors, getPlatformIdByAddress } from './platforms';
import { SkillManager } from './skillManager';
import { TerminalSessionManager } from './terminalSessionManager';
import {
    formatCommandPolicyError,
    formatAllowedCommands,
    parseCommandLine,
    resolveExecutionPlan,
    validateParsedCommand
} from './servers/commandSecurity';

const RUN_IN_TERMINAL_TOOL = {
    name: "run_in_terminal",
    description: "Start a single long-running command in a visible VS Code terminal session. Returns a session_id immediately so you can inspect output, check status, or stop it later.",
    inputSchema: {
        type: "object",
        properties: {
            command: { type: "string", description: "A single command to execute (for example: 'pnpm dev'). Shell chaining, pipes, redirects, and command substitution are blocked." },
            cwd: { type: "string", description: "Optional working directory inside the workspace. Defaults to the workspace root." },
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

const LIST_SKILLS_TOOL = {
    name: "list_skills",
    description: "List skills discovered in the current VS Code workspace. Use this before loading a skill so you know what is available.",
    inputSchema: {
        type: "object",
        properties: {}
    }
};

const SEARCH_SKILLS_TOOL = {
    name: "search_skills",
    description: "Search workspace skills by task or keyword. Use this when the user asks for a workflow, template, guide, or specialized capability.",
    inputSchema: {
        type: "object",
        properties: {
            query: { type: "string", description: "Keywords describing the task or domain to match against skills." },
            limit: { type: "number", description: "Maximum number of matches to return. Default: 10.", default: 10 }
        },
        required: ["query"]
    }
};

const GET_SKILL_TOOL = {
    name: "get_skill",
    description: "Load the full SKILL.md content for a workspace skill. Prefer passing skill_id from list_skills or search_skills when available.",
    inputSchema: {
        type: "object",
        properties: {
            skill_id: { type: "string", description: "Stable skill identifier returned by list_skills or search_skills." },
            skill_name: { type: "string", description: "Fallback skill name when skill_id is unavailable." }
        }
    }
};

const GET_SKILL_RESOURCE_TOOL = {
    name: "get_skill_resource",
    description: "Read a text resource referenced by a workspace skill, such as a file under references/, templates/, or scripts/.",
    inputSchema: {
        type: "object",
        properties: {
            skill_id: { type: "string", description: "Stable skill identifier returned by list_skills or search_skills." },
            skill_name: { type: "string", description: "Fallback skill name when skill_id is unavailable." },
            resource_path: { type: "string", description: "Path relative to the skill directory." }
        },
        required: ["resource_path"]
    }
};

const LIST_TERMINAL_SESSIONS_TOOL = {
    name: "list_terminal_sessions",
    description: "List visible terminal sessions created by run_in_terminal.",
    inputSchema: {
        type: "object",
        properties: {}
    }
};

const GET_TERMINAL_SESSION_TOOL = {
    name: "get_terminal_session",
    description: "Get the current status for a run_in_terminal session by session_id.",
    inputSchema: {
        type: "object",
        properties: {
            session_id: { type: "string", description: "The session id returned by run_in_terminal." }
        },
        required: ["session_id"]
    }
};

const READ_TERMINAL_OUTPUT_TOOL = {
    name: "read_terminal_output",
    description: "Read recent output from a run_in_terminal session.",
    inputSchema: {
        type: "object",
        properties: {
            session_id: { type: "string", description: "The session id returned by run_in_terminal." },
            tail_lines: { type: "number", description: "Number of recent lines to return. Default: 200.", default: 200 }
        },
        required: ["session_id"]
    }
};

const STOP_TERMINAL_SESSION_TOOL = {
    name: "stop_terminal_session",
    description: "Stop a run_in_terminal session by session_id.",
    inputSchema: {
        type: "object",
        properties: {
            session_id: { type: "string", description: "The session id returned by run_in_terminal." }
        },
        required: ["session_id"]
    }
};

const BUILTIN_SELECTORS = getDefaultSelectors();

// Tools that always show full schema (Hot Tools)
const BASIC_TOOLS = [
    'read_file', 'read_text_file', 'write_file', 'edit_file', 
    'list_directory', 'list_directory_with_sizes', 
    'run_in_terminal', 'execute_command', 
    'search_files', 'get_tool_definitions', 'list_tools',
    'list_skills', 'search_skills', 'get_skill', 'get_skill_resource',
    'list_terminal_sessions', 'get_terminal_session', 'read_terminal_output', 'stop_terminal_session'
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
    aiSites?: any[]; // Dynamic sites from config
    skillDirectories?: string[];
}

interface StartResult {
    port: number;
    token: string;
}

export class GatewayManager {
    private app: express.Express | null = null;
    private server: any = null;
    private toolRouter = new Map<string, { client: Client; definition: any; serverId: string }>();
    private connectedClients: { id: string; client: Client }[] = [];

    // Helper: Generate grouped tool list
    private _generateGroupedTools() {
        // 1. Gather all tools with their server association
        const allTools = Array.from(this.toolRouter.values()).map(t => ({ ...t.definition, _server: t.serverId }));
        
        // 2. Inject Internal Tools
        allTools.push({ ...RUN_IN_TERMINAL_TOOL, _server: 'internal' });
        allTools.push({ ...GET_TOOL_DEFINITIONS_TOOL, _server: 'internal' });
        allTools.push({ ...LIST_SKILLS_TOOL, _server: 'internal' });
        allTools.push({ ...SEARCH_SKILLS_TOOL, _server: 'internal' });
        allTools.push({ ...GET_SKILL_TOOL, _server: 'internal' });
        allTools.push({ ...GET_SKILL_RESOURCE_TOOL, _server: 'internal' });
        allTools.push({ ...LIST_TERMINAL_SESSIONS_TOOL, _server: 'internal' });
        allTools.push({ ...GET_TERMINAL_SESSION_TOOL, _server: 'internal' });
        allTools.push({ ...READ_TERMINAL_OUTPUT_TOOL, _server: 'internal' });
        allTools.push({ ...STOP_TERMINAL_SESSION_TOOL, _server: 'internal' });

        // 3. Group by Server
        const groups: Record<string, { tools: any[], hidden_tools: string[] }> = {};

        allTools.forEach(tool => {
            const server = tool._server || 'unknown';
            if (!groups[server]) {
                groups[server] = { tools: [], hidden_tools: [] };
            }

            // Hot vs Cold decision
            if (BASIC_TOOLS.includes(tool.name)) {
                // Hot: Show full schema
                // Remove internal grouping tag before sending
                const { _server, ...cleanTool } = tool;
                groups[server].tools.push(cleanTool);
            } else {
                // Cold: Only name
                groups[server].hidden_tools.push(tool.name);
            }
        });

        // 4. Transform to Array format
        return Object.entries(groups).map(([server, data]) => ({
            server,
            tools: data.tools,
            hidden_tools: data.hidden_tools.sort()
        }));
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

    constructor(outputChannel: vscode.OutputChannel, extensionPath: string, context: vscode.ExtensionContext, onAutoStop?: () => void) {
        this.outputChannel = outputChannel;
        this.extensionPath = extensionPath;
        this.context = context;
        this.onAutoStop = onAutoStop || null;
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
        this.outputChannel.appendLine(`[${time}] ❌ ${message} ${err ? (err.message || JSON.stringify(err)) : ''}`);
    }

    invalidateSkillCache(reason?: string) {
        this.skillManager.invalidateCache(reason);
    }

    private resolveWorkspaceCwd(requestedCwd: unknown): string {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            throw new Error('A workspace folder is required to run terminal commands.');
        }

        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
        if (!requestedCwd) {
            return root;
        }

        const cwd = String(requestedCwd);
        const resolved = path.isAbsolute(cwd) ? path.normalize(cwd) : path.resolve(root, cwd);
        const relative = path.relative(root, resolved);
        const isSubPath = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));

        if (!isSubPath) {
            throw new Error(`Permission denied: cwd must stay inside the workspace (${root}).`);
        }

        return resolved;
    }

    private validateTerminalCommand(command: unknown, cwd: string) {
        const commandLine = String(command || '').trim();
        const parsed = parseCommandLine(commandLine);

        if (!parsed.ok) {
            throw new Error(`${formatCommandPolicyError(parsed.reason)} Policy: ${formatAllowedCommands(process.platform)}`);
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || cwd;
        const validation = validateParsedCommand(parsed.value, {
            projectRoot: workspaceRoot,
            platform: process.platform
        });

        if (!validation.valid) {
            throw new Error(`${validation.reason} Policy: ${formatAllowedCommands(process.platform)}`);
        }

        return {
            commandLine,
            execution: resolveExecutionPlan(parsed.value, process.platform, process.env),
            env: { ...process.env } as NodeJS.ProcessEnv
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
                    client = new Client({ name: "mcp-gateway-vscode", version: "1.0.0" }, { capabilities: {} });
                    await client.connect(transport);
                
                } else if (config.type === 'sse') {
                    if (!config.url) {throw new Error("Missing 'url' for SSE config");}
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
                    this.toolRouter.set(tool.name, { client, definition: tool, serverId });
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
        this.skillDirectories = config.skillDirectories || [];
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

        // 4.1 核心配置与协议下发接口 (Initialization)
        this.app.get('/v1/init', (req, res) => {
            this.log('📥 Init Sync: Browser requested default rules and prompts');

            // Generate syncedAiSites with merged selectors
            const syncedAiSites = (config.aiSites || []).map(site => {
                const platformId = getPlatformIdByAddress(site.address);
                const defaultSelectors = platformId ? BUILTIN_SELECTORS[platformId] || {} : {};

                return {
                    ...site,
                    selectors: { ...defaultSelectors, ...(site.selectors || {}) }
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
                        <h2 id="bridge-title">Connecting to WebMCP...</h2>
                        <p id="bridge-status">Synchronizing with VS Code...</p>
                    </div>

                    <div id="mcp-data" data-port="${port}" data-token="${token}" data-target="${target}" data-workspace-id="${workspaceId}" style="display:none;"></div>

                    <div class="card" id="install-guide" style="display:none; border: 1px solid #e74c3c; box-shadow: 0 4px 15px rgba(231, 76, 60, 0.2);">
                        <h2 id="install-title" style="color:#e74c3c; margin-bottom:10px">⚠️ Extension Required</h2>
                        <p id="install-desc" style="margin-bottom:20px">To enable auto-connection, you need the companion browser extension:</p>
                        <div style="background:#333; padding:10px; border-radius:6px; margin-bottom:20px; font-weight:bold; color:#fff">
                            🧩 WebMCP Bridge
                        </div>
                        <a id="install-button" href="https://github.com/three-water666/WebMCP/releases" target="_blank" rel="noopener noreferrer" onclick="alert(window.__webmcpBridgeI18n?.installAlert || 'Please download the browser extension from GitHub Releases: https://github.com/three-water666/WebMCP/releases');" style="display:inline-block; background:#e74c3c; color:white; padding:10px 20px; text-decoration:none; border-radius:4px; font-weight:bold;">
                            Get Browser Extension
                        </a>
                        <p id="install-warn" class="warn" style="margin-top:15px; font-size:12px">Already installed? Try reloading this page.</p>
                    </div>

                    <script>
                        const isZh = navigator.language.toLowerCase().startsWith('zh');
                        const bridgeI18n = isZh ? {
                            connectingTitle: '正在连接 WebMCP...',
                            connectingStatus: '正在与 VS Code 同步...',
                            installTitle: '需要浏览器扩展',
                            installDesc: '要启用自动连接，您需要先安装配套的浏览器扩展：',
                            installButton: '前往下载浏览器扩展',
                            installWarn: '如果已经安装，请尝试刷新当前页面。',
                            installAlert: '请前往 GitHub Releases 下载浏览器插件：https://github.com/three-water666/WebMCP/releases'
                        } : {
                            connectingTitle: 'Connecting to WebMCP...',
                            connectingStatus: 'Synchronizing with VS Code...',
                            installTitle: 'Browser Extension Required',
                            installDesc: 'To enable auto-connection, you need the companion browser extension:',
                            installButton: 'Download Browser Extension',
                            installWarn: 'Already installed? Try reloading this page.',
                            installAlert: 'Please download the browser extension from GitHub Releases: https://github.com/three-water666/WebMCP/releases'
                        };
                        window.__webmcpBridgeI18n = bridgeI18n;
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

                if (args.path) {args.path = fixPath(args.path);}
                if (args.cwd) {args.cwd = fixPath(args.cwd);} // Fix: Resolve CWD for execute_command
                if (args.repo_path) {args.repo_path = fixPath(args.repo_path);} // Fix: Support relative path for Git tools
                if (args.source) {args.source = fixPath(args.source);}
                if (args.destination) {args.destination = fixPath(args.destination);}
                if (Array.isArray(args.paths)) {args.paths = args.paths.map((p: any) => fixPath(p));}
            }

            if (name === 'list_tools') {
                const result = this._generateGroupedTools();
                this.log(`   🚀 Executing: list_tools (Internal) - Grouped into ${result.length} servers`);
                this.log(`   ✅ Finished: list_tools (0ms)`);
                return res.json({
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                    isError: false
                });
            }

            if (name === 'run_in_terminal') {
                try {
                    const cwd = this.resolveWorkspaceCwd(args?.cwd);
                    const validated = this.validateTerminalCommand(args?.command, cwd);
                    this.log(`   🚀 Executing: run_in_terminal ${validated.commandLine}`);

                    const session = this.terminalSessionManager.createSession({
                        commandLine: validated.commandLine,
                        file: validated.execution.file,
                        args: validated.execution.args,
                        cwd,
                        env: validated.env,
                        autoFocus: args?.auto_focus !== false
                    });

                    this.log(`   ✅ Finished: run_in_terminal (${session.id})`);
                    return res.json({
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                session_id: session.id,
                                name: session.name,
                                status: session.status,
                                cwd: session.cwd,
                                command: session.command
                            }, null, 2)
                        }],
                        isError: false
                    });
                } catch (error: any) {
                    this.error('Terminal session start failed', error);
                    return res.status(400).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
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
                    } else if (tName === 'list_skills') {
                        definitions.push(LIST_SKILLS_TOOL);
                    } else if (tName === 'search_skills') {
                        definitions.push(SEARCH_SKILLS_TOOL);
                    } else if (tName === 'get_skill') {
                        definitions.push(GET_SKILL_TOOL);
                    } else if (tName === 'get_skill_resource') {
                        definitions.push(GET_SKILL_RESOURCE_TOOL);
                    } else if (tName === 'list_terminal_sessions') {
                        definitions.push(LIST_TERMINAL_SESSIONS_TOOL);
                    } else if (tName === 'get_terminal_session') {
                        definitions.push(GET_TERMINAL_SESSION_TOOL);
                    } else if (tName === 'read_terminal_output') {
                        definitions.push(READ_TERMINAL_OUTPUT_TOOL);
                    } else if (tName === 'stop_terminal_session') {
                        definitions.push(STOP_TERMINAL_SESSION_TOOL);
                    }
                }

                this.log(`   ✅ Finished: get_tool_definitions (Found ${definitions.length}/${requestedNames.length})`);
                return res.json({
                    content: [{ type: 'text', text: JSON.stringify(definitions, null, 2) }],
                    isError: false
                });
            }

            if (name === 'list_skills') {
                try {
                    const result = await this.skillManager.listSkills(this.skillDirectories);
                    this.log(`   🚀 Executing: list_skills (Internal) - Found ${result.length} skills`);
                    this.log(`   ✅ Finished: list_skills (0ms)`);
                    return res.json({
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                        isError: false
                    });
                } catch (error: any) {
                    this.error('Skill listing failed', error);
                    return res.status(500).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
            }

            if (name === 'search_skills') {
                try {
                    const query = String(args?.query || '');
                    const limit = typeof args?.limit === 'number' ? args.limit : 10;
                    this.log(`   🚀 Executing: search_skills "${query}"`);
                    const result = await this.skillManager.searchSkills(query, this.skillDirectories, limit);
                    this.log(`   ✅ Finished: search_skills (Found ${result.length})`);
                    return res.json({
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                        isError: false
                    });
                } catch (error: any) {
                    this.error('Skill search failed', error);
                    return res.status(500).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
            }

            if (name === 'get_skill') {
                try {
                    this.log(`   🚀 Executing: get_skill`);
                    const result = await this.skillManager.getSkillDetails({
                        skill_id: args?.skill_id,
                        skill_name: args?.skill_name
                    }, this.skillDirectories);
                    this.log(`   ✅ Finished: get_skill (${result.skill.id})`);
                    return res.json({
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                        isError: false
                    });
                } catch (error: any) {
                    this.error('Skill load failed', error);
                    return res.status(500).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
            }

            if (name === 'get_skill_resource') {
                try {
                    this.log(`   🚀 Executing: get_skill_resource`);
                    const result = await this.skillManager.getSkillResource({
                        skill_id: args?.skill_id,
                        skill_name: args?.skill_name,
                        resource_path: args?.resource_path
                    }, this.skillDirectories);
                    this.log(`   ✅ Finished: get_skill_resource (${result.resource_path})`);
                    return res.json({
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                        isError: false
                    });
                } catch (error: any) {
                    this.error('Skill resource load failed', error);
                    return res.status(500).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
            }

            if (name === 'list_terminal_sessions') {
                const sessions = this.terminalSessionManager.listSessions();
                return res.json({
                    content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }],
                    isError: false
                });
            }

            if (name === 'get_terminal_session') {
                try {
                    const session = this.terminalSessionManager.getSession(String(args?.session_id || ''));
                    return res.json({
                        content: [{ type: 'text', text: JSON.stringify(session, null, 2) }],
                        isError: false
                    });
                } catch (error: any) {
                    return res.status(404).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
            }

            if (name === 'read_terminal_output') {
                try {
                    const tailLines = typeof args?.tail_lines === 'number' ? args.tail_lines : 200;
                    const result = this.terminalSessionManager.readSessionOutput(String(args?.session_id || ''), tailLines);
                    return res.json({
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                        isError: false
                    });
                } catch (error: any) {
                    return res.status(404).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
            }

            if (name === 'stop_terminal_session') {
                try {
                    const session = this.terminalSessionManager.stopSession(String(args?.session_id || ''));
                    return res.json({
                        content: [{ type: 'text', text: JSON.stringify(session, null, 2) }],
                        isError: false
                    });
                } catch (error: any) {
                    return res.status(404).json({
                        isError: true,
                        content: [{ type: 'text', text: `Error: ${error.message}` }]
                    });
                }
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
            } catch { }
        });
        this.connectedClients = [];
    }
}
