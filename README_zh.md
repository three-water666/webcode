# WebMCP 🌉

## ⚠️ 免责声明 (使用前必读)

> 1. **风险自负**：本项目连接了不可预测的大语言模型 (LLM) 与您的本地文件系统。**使用本工具造成的文件丢失或系统损坏，由用户自行承担风险。**
> 2. **账号安全**：自动化交互可能违反部分 AI 服务商 (如 OpenAI, DeepSeek) 的使用条款 (ToS)。建议仅使用测试账号，并避免高频请求。
> 3. **数据隐私**：请勿上传敏感数据 (API Key, 密钥)。您的本地代码会被发送给第三方 AI 服务器。

**连接网页版 AI 与本地开发环境的通用桥梁。**

> 🛑 **告别 Copy-Paste**：不再需要在 Gemini/ChatGPT/DeepSeek 和 VS Code 之间手动复制粘贴代码。
> 🚀 **零配置体验**：无需复杂配置，点击即用。
> 🔐 **安全无忧**：采用动态 Token 认证机制，确保只有您的 VS Code 能连接浏览器。

---

## 🌟 核心特性

- **⚡️ Zero-Config (零配置)**：VS Code 自动管理端口和认证 Token，一键握手连接。
- **🌍 全平台支持**：完美适配 **Gemini**、**ChatGPT**、**DeepSeek** 等主流网页版 AI。
- **🔌 协议标准化**：基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)，支持挂载本地文件系统、Git 等任意工具。
- **🛡️ 动态安全**：
  - 每次启动生成随机 **Token**，彻底告别繁琐的 Extension ID 白名单。
  - 支持 **Origin 隔离**，防止恶意网页访问本地网关。
- **🧠 智能路由**：
  - 支持根据 URL 自动选择浏览器 (如 Gemini -> Edge, ChatGPT -> Chrome)。
  - 支持同时打开多个 VS Code 窗口，多路连接互不干扰。

---

## 🛡️ 安全与隐私
我们采用 "Human-in-the-Loop" (人机回环) 设计来保障您的安全：

- **👮 Human-in-the-Loop (人工介入)**:
  - **强制审批**：敏感操作 (如 `write_file`, `execute_command`) **默认拦截**。
  - **明确授权**：每个新的工具调用都需要您点击弹窗中的 "Approve" 才能执行。
- **🔒 本地执行**：所有逻辑仅在您的浏览器和 VS Code 运行，不经过任何中间服务器。
- **🛡️ 沙箱模式**：命令执行限制在当前工作区根目录，无法访问系统敏感目录。

---

## 📖 使用指南

### 1. 安装插件
- **VS Code**: 在扩展市场搜索 `WebMCP Gateway` 并安装。
- **浏览器 (手动安装)**:
  1. 前往 [Releases](https://github.com/three-water666/WebMCP/releases) 下载最新 `mcp-bridge-browser.zip`。
  2. 解压文件。
  3. 打开浏览器扩展页 (`chrome://extensions`)，开启右上角 **开发者模式**。
  4. 点击 **加载已解压的扩展程序**，选择解压后的文件夹。

### 2. 启动连接
1. 打开 VS Code。点击状态栏右下角的 `WebMCP: OFF` 按钮启动服务。当显示为 `WebMCP: <端口号>` (如 `34567`) 时，表示服务已就绪。
2. 点击状态栏图标，选择您想使用的 AI 平台（例如 `Open Gemini`）。
3. 浏览器会自动打开一个中转页，进行 **自动握手**，随后跳转到 AI 页面。
4. **连接成功！** 浏览器插件图标将变为绿色 `ON` 状态。

### 3. 配置 AI 初始化提示词 (重要)
在开始使用前，需要先把初始化提示词放到 Web AI 的全局记忆/用户偏好/自定义指令中：
1. 点击浏览器右上角的 **WebMCP Bridge** 插件图标。
2. 点击弹窗中的 **Copy Initialization Prompt** 按钮。
3. 将复制的内容添加到 Web AI 的“记忆 / 用户偏好 / 自定义指令”等常驻位置。
4. 这一步通常只需要配置一次。

### 4. 开始对话
现在您可以直接在网页 AI 中发送 `/webmcp` 或 `@webmcp`，并同时写上您的需求，例如：
- “读取 `src/utils.ts` 并帮我写个单元测试。”
- “检查当前目录下的文件结构。”
- “在 `docs` 目录下生成项目文档。”

### 5. 工作区 Skills
WebMCP 现在可以把当前 VS Code 工作区中的本地 skills 暴露给网页模型。

- 默认扫描目录：
  - `.agents/skills`
  - `.codex/skills`
  - `skills`
- 只要某个目录下存在 `SKILL.md`，它就会被识别为一个 skill。
- AI 的推荐读取流程是渐进式的：
  1. 先调用 `list_skills` 或 `search_skills`
  2. 再对目标 skill 调用 `get_skill`
  3. 只有当 skill 引用了 `references/`、`templates/`、`scripts/` 等附属文件时，再调用 `get_skill_resource`

目录示例：

```text
.agents/
  skills/
    my-skill/
      SKILL.md
      references/
        examples.md
```

您也可以通过 VS Code 设置项 `mcpGateway.skillDirectories` 自定义扫描目录。

> **小贴士**：
> - 点击状态栏选择 `Custom Launch...` 可以临时手动选择用哪个浏览器打开。
> - 在 VS Code 设置中搜索 `Browser Rules` 可配置默认的“域名-浏览器”映射规则。

---

## 🛠️ 开发者指南 (源码编译)

如果您想自己编译或贡献代码，请按以下步骤操作：

### 环境要求
- Node.js (v18+)
- VS Code

### 1. 获取源码
```bash
git clone [https://github.com/three-water666/WebMCP.git](https://github.com/three-water666/WebMCP.git)
cd WebMCP
```

### 2. 一键构建
项目内置了跨平台构建脚本，可同时生成 VS Code 插件 (`.vsix`) 和浏览器插件 (`.zip`)。

**Mac / Linux:**
```bash
chmod +x build_release.sh
./build_release.sh
```

**Windows (PowerShell):**
```powershell
.\build_release.ps1
```

构建产物将位于根目录的 `release/` 文件夹中。

### 3. 安装调试
- **VS Code 插件**: 在 VS Code 侧边栏 -> `...` -> `Install from VSIX...` 选择生成的 `.vsix` 文件。
- **浏览器插件**: 打开浏览器扩展管理页 -> 开启“开发者模式” -> 点击“加载已解压的扩展程序” -> 选择 `release/` 下解压后的文件夹 (或直接加载源码目录 `mcp-bridge-browser`)。

---

## 🤝 贡献与反馈

非常欢迎您的贡献！无论是提交 Issue 反馈 Bug，还是提交 Pull Request 改进代码，我们都非常感谢。

- **提交 Issue**: 请详细描述您遇到的问题或建议。
- **提交 PR**: 请确保代码风格一致，并通过了基本的测试。

---

## 📄 协议

本项目采用 [MIT 协议](LICENSE) 开源。
