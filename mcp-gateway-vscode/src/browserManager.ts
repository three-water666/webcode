import * as puppeteer from 'puppeteer-core';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GatewayManager } from './gateway';

// 默认初始提示词 (System Prompt - Chinese Version)
const DEFAULT_PROMPT = `# 角色设定
你是一个 AI 助手。在此会话中，用户为你挂载了与本地环境交互的新能力（通过 JSON 指令）。
这些工具是你的扩展能力，具体包含的功能（如文件操作、代码管理等）是动态配置的。请根据用户的具体需求，灵活判断是否调用这些工具来辅助完成任务。

# 通信协议 (Protocol)
调用工具时，必须输出 **JSON 代码块**。

## 1. 请求格式 (你发送给插件)
\`\`\`json
{
  "mcp_action": "call",
  "name": "工具名称",
  "arguments": {
    "key": "value"
  },
  "request_id": "step_1"
}
\`\`\`

## 2. 响应格式 (插件返回给你)
插件执行后，会以如下格式返回结果：
\`\`\`json
{
  "mcp_action": "result",
  "request_id": "step_1",
  "output": "这里是文件内容或命令执行结果..."
}
\`\`\`

# 初始化 (Initialization)
**你的首要任务是明确当前的能力边界和项目背景。**

1. **获取能力**：你的第一步操作**必须**是调用 \`list_tools\` 来获取可用工具列表。
2. **读取记忆**：紧接着，请**尝试读取根目录下的 \`.ai_context.md\` 文件**。这是前任 AI 留下的“交接文档”，记录了项目的核心架构、注意事项和未完成任务。读取它能让你瞬间理解项目全貌，避免重复分析。
3. **等待用户任务**：完成前两步后等待用户下达任务，如何工具列表中的工具可以帮助你完成任务，请使用它。

# 核心规则
1. **严禁猜测**：不要假设自己拥有某个工具，一切以 \`list_tools\` 返回为准。
2. **支持并发**：你可以一次性输出多个 JSON 块来调用多个工具，结果会批量返回。注意：不能一个 JSON 块包含多个工具调用，每个工具调用应该在一个单独的 JSON 块中。
3. **直接行动**：不要闲聊，直接发送你的初始化指令。
4. **薪火相传**：\`.ai_context.md\` 是你与未来 AI 的沟通桥梁。如果你修改了项目架构或做出了重要决策，**请务必更新该文件**。`;

export class BrowserManager {
    private browser: puppeteer.Browser | null = null;
    private gateway: GatewayManager;
    private outputChannel: vscode.OutputChannel;

    constructor(gateway: GatewayManager, outputChannel: vscode.OutputChannel) {
        this.gateway = gateway;
        this.outputChannel = outputChannel;
    }

    private log(msg: string) {
        this.outputChannel.appendLine(`[Browser] ${msg}`);
    }

    private findBrowserPath(type: 'chrome' | 'edge'): string | null {
        const platform = os.platform();
        const chromePaths = {
            darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
            win32: [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
            ],
            linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
        };
        const edgePaths = {
            darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
            win32: [
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
            ],
            linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable']
        };

        const paths = type === 'chrome' ? chromePaths : edgePaths;
        // @ts-ignore
        const candidates = paths[platform] || [];

        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return null;
    }

    async launch(url: string, browserType: 'chrome' | 'edge' = 'chrome') {
        // 🔄 单例检测：如果浏览器已经打开且连接正常，直接复用
        if (this.browser && this.browser.isConnected()) {
            this.log(`Reusing existing ${browserType} instance...`);
            const pages = await this.browser.pages();
            const page = pages.length > 0 ? pages[0] : await this.browser.newPage();
            await page.goto(url);
            await page.bringToFront(); // 尝试激活窗口
            return;
        }

        const executablePath = this.findBrowserPath(browserType);
        if (!executablePath) {
            vscode.window.showErrorMessage(`Could not find ${browserType}.`);
            return;
        }

        const userDataDir = path.join(os.homedir(), '.webmcp', 'browser_data');

        this.browser = await puppeteer.launch({
            executablePath,
            headless: false,
            defaultViewport: null,
            userDataDir: userDataDir,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--window-size=500,1000',
                '--window-position=0,0',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-infobars'
                // '--restore-last-session' // ❌ 已移除：每次启动保持干净，不恢复旧标签页
            ]
        });

        const pages = await this.browser.pages();
        const page = pages.length > 0 ? pages[0] : await this.browser.newPage();

        // 📺 日志管道
        page.on('console', msg => {
            const text = msg.text();
            if (text.startsWith('[WebMCP]')) {
                this.log(`🌐 ${text}`);
            }
        });

        // ⚡ 通信桥梁
        await page.exposeFunction('mcp_native_bridge', async (payload: any) => {
            try {
                const result = await this.gateway.executeTool(payload.name, payload.arguments);
                return { success: true, data: result };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        // 💉 核心注入逻辑
        await page.evaluateOnNewDocument((initPrompt) => {
            const SELECTORS: any = {
                deepseek: {
                    messageBlocks: ".ds-message",
                    codeBlocks: "pre",
                    inputArea: "textarea.ds-scroll-area",
                    sendButton: "div[role='button']:has(path[d^='M8.3125'])",
                },
                chatgpt: {
                    messageBlocks: 'div[data-message-author-role="assistant"]',
                    codeBlocks: "pre code",
                    inputArea: "#prompt-textarea",
                    sendButton: 'button[data-testid="send-button"]',
                },
                gemini: {
                    messageBlocks: ".markdown",
                    codeBlocks: "pre code",
                    inputArea: 'div[contenteditable="true"]',
                    sendButton: 'button[aria-label="发送"], button[aria-label="Send"], button[aria-label*="Send"]',
                },
            };

            const processedRequests = new Set();
            let toolCallCount = 0;
            
            const host = location.host;
            let platform = '';
            if (host.includes('deepseek')) platform = 'deepseek';
            else if (host.includes('gemini')) platform = 'gemini';
            else platform = 'chatgpt';

            const DOM = SELECTORS[platform];
            console.log(`[WebMCP] Injected on ${platform}`);

            // === 0. 初始化扫描 (防止刷新页面后重复执行最后一条) ===
            // 在页面加载初期，把当前所有已存在的工具调用全部标记为“已处理”
            setTimeout(() => {
                const messages = document.querySelectorAll(DOM.messageBlocks);
                messages.forEach((msg) => {
                    const codeEls = msg.querySelectorAll(DOM.codeBlocks);
                    codeEls.forEach((el: any) => {
                        const text = el.textContent || '';
                        if (text.includes('"mcp_action": "call"')) {
                            try {
                                const json = JSON.parse(text);
                                if (json.request_id) {
                                    processedRequests.add(json.request_id);
                                    // 视觉上标记为历史（灰色），但也可能用户想看绿色的Done，这里为了安全先标灰，或者标示“Restored”
                                    // 为了体验更好，我们可以检查它后面有没有 result，如果有result标绿，没有标灰。
                                    // 简单起见，刷新后的都标为 History，避免歧义
                                    if (el.dataset.mcpVisual !== "true") {
                                        markVisual(el as HTMLElement, "History (Restored)", "#E0E0E0");
                                    }
                                }
                            } catch(e) {}
                        }
                    });
                });
                console.log(`[WebMCP] Init scan complete. Ignored ${processedRequests.size} historical calls.`);
            }, 1000);

            // === 1. 初始提示词检测 ===
            setTimeout(() => {
                const messages = document.querySelectorAll(DOM.messageBlocks);
                const inputEl = document.querySelector(DOM.inputArea) as HTMLElement;
                
                if (messages.length === 0 && inputEl) {
                    const currentVal = (inputEl as any).value || inputEl.innerText || '';
                    if (!currentVal.trim()) {
                        console.log('[WebMCP] 🚀 Injecting Initial Prompt...');
                        pasteText(initPrompt, DOM, false);
                        // 用户手动发送：防止未登录时误触
                        // setTimeout(() => clickSendWithRetry(DOM), 500);
                    }
                }
            }, 3000);

            // === 2. 主轮询循环 ===
            // 延迟 2 秒启动，确保“初始化扫描”先完成，避免误执行历史消息
            setTimeout(() => {
            setInterval(async () => {
                if (!DOM) return;

                const messages = document.querySelectorAll(DOM.messageBlocks);
                if (messages.length === 0) return;

                // --- 全局扫描与视觉维护 ---
                const pendingCalls: any[] = [];
                
                messages.forEach((messageBlock, index) => {
                    const isLastMessage = index === messages.length - 1;
                    const codeElements = messageBlock.querySelectorAll(DOM.codeBlocks);

                    codeElements.forEach((codeEl: any) => {
                        const el = codeEl as HTMLElement;
                        const textContent = el.textContent?.trim() || '';
                        if (!textContent.includes('"mcp_action": "call"')) return;

                        try {
                            const payload = JSON.parse(textContent);
                            if (payload.mcp_action === "call" && payload.request_id) {
                                
                                if (processedRequests.has(payload.request_id)) {
                                    // A. 已处理：检查视觉标记是否丢失 (被React重绘)，丢失则补上
                                    if (el.dataset.mcpVisual !== "true") {
                                        markVisual(el, "Done", "#69F0AE");
                                    }
                                } else {
                                    // B. 未处理
                                    if (isLastMessage) {
                                        // 激活：只有最后一条消息才执行
                                        processedRequests.add(payload.request_id);
                                        const badge = markVisual(el, "Running...", "#00E676");
                                        pendingCalls.push({ payload, element: el, badge });
                                    } else {
                                        // 历史：标记为跳过，防止刷新页面后重放
                                        processedRequests.add(payload.request_id);
                                        markVisual(el, "History", "#E0E0E0");
                                    }
                                }
                            }
                        } catch (e) {}
                    });
                });

                // --- 批量执行 ---
                if (pendingCalls.length > 0) {
                    console.log(`[WebMCP] Batch processing ${pendingCalls.length} calls...`);
                    
                    const results = [];
                    const promises = pendingCalls.map(async (item) => {
                        const { payload, badge } = item;
                        console.log(`[WebMCP] ⚡ Calling: ${payload.name}`);
                        
                        // @ts-ignore
                        const response = await window.mcp_native_bridge(payload);
                        
                        badge.innerText = response.success ? "Done" : "Error";
                        badge.style.background = response.success ? "#69F0AE" : "#FF5252";

                        toolCallCount++;
                        const responseJson: any = {
                            mcp_action: "result",
                            request_id: payload.request_id,
                            status: "success",
                            output: response.success ? response.data : response.error
                        };
                        if (!response.success) responseJson.status = "error";

                        if (toolCallCount > 0 && toolCallCount % 5 === 0) {
                            responseJson.system_note = `[System] Reminder: Tool calls MUST use this JSON format: {\"mcp_action\":\"call\", \"name\": \"tool_name\", \"arguments\": {...}}.`;
                        }

                        return JSON.stringify(responseJson, null, 2);
                    });

                    const rawResults = await Promise.all(promises);
                    const finalPasteText = rawResults.map(r => `\`\`\`json\n${r}\n\`\`\``).join("\n\n");
                    
                    console.log(`[WebMCP] Pasting batch results...`);
                    pasteText(finalPasteText, DOM, true);
                }

            }, 1000);
            }, 2000); // 延迟启动结束

            function markVisual(codeEl: HTMLElement, text: string, color: string) {
                codeEl.dataset.mcpVisual = "true";
                codeEl.style.border = `2px solid ${color}`;
                codeEl.style.borderRadius = "4px";
                codeEl.style.position = "relative";
                
                let badge = codeEl.querySelector('.webmcp-badge') as HTMLElement;
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'webmcp-badge';
                    Object.assign(badge.style, { 
                        position: 'absolute', top: '0', right: '0', 
                        color: '#000', fontSize: '10px', padding: '2px 4px', 
                        pointerEvents: 'none', fontWeight: 'bold', zIndex: '10'
                    });
                    codeEl.appendChild(badge);
                }
                badge.innerText = text;
                badge.style.background = color;
                return badge;
            }

            // === 辅助函数 ===
            function pasteText(text: string, domConfig: any, autoSend: boolean) {
                const inputEl = document.querySelector(domConfig.inputArea) as HTMLElement;
                if (!inputEl) return;

                inputEl.focus();
                
                let success = false;
                try {
                    document.execCommand('selectAll', false, undefined);
                    success = document.execCommand('insertText', false, text);
                } catch (e) {}

                if (!success) {
                    if (inputEl instanceof HTMLTextAreaElement) {
                        inputEl.value = text;
                    } else {
                        inputEl.innerText = text;
                    }
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                }

                if (autoSend) {
                    clickSendWithRetry(domConfig);
                }
            }

            function clickSendWithRetry(domConfig: any) {
                let retries = 0;
                const maxRetries = 10;
                
                const attempt = () => {
                    const btn = document.querySelector(domConfig.sendButton) as HTMLElement;
                    const inputEl = document.querySelector(domConfig.inputArea) as HTMLElement;
                    
                    const isDisabled = btn ? (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true') : true;
                    const hasContent = inputEl ? (inputEl.innerText.trim().length > 0 || (inputEl as any).value.trim().length > 0) : false;

                    if (btn && !isDisabled && hasContent) {
                        console.log('[WebMCP] Clicking Send...');
                        btn.click();
                    } else {
                        retries++;
                        if (retries < maxRetries) {
                            setTimeout(attempt, 500);
                        } else {
                            console.log('[WebMCP] ❌ Auto-send failed (timeout).');
                        }
                    }
                };

                setTimeout(attempt, 500);
            }

        }, DEFAULT_PROMPT);

        this.log(`Navigating to ${url}...`);
        await page.goto(url);
    }
}