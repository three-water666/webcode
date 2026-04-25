# webcode

webcode 用来把 ChatGPT、Gemini、DeepSeek 这类网页 AI 接到 VS Code 中，并支持 MCP 和 Skills。

[English README](README.md)

## 使用前说明

请先确认以下几点：

1. 风险自担。webcode 会把远程 AI 和本地工具、文件连接起来，工具执行带来的后果由使用者自己负责。
2. 请自行确认所使用 AI 平台的服务条款。部分平台可能不允许自动化交互。
3. 不要上传密钥、隐私数据或敏感代码，除非你明确接受这些内容会发送给对应的 AI 服务商。

## 主要特性

- **零配置连接**：VS Code 自动管理本地端口和会话 Token
- **浏览器路由**：不同站点可以按规则使用不同浏览器打开
- **动态鉴权**：每次会话使用临时 Token，不依赖固定扩展 ID 白名单
- **来源隔离**：Gateway 只接受预期来源的请求
- **工作区技能**：可以从当前工作区发现本地技能，并按需逐步暴露给模型
- **人工确认机制**：敏感操作可以要求用户明确批准后再执行

## 安全说明

webcode 的设计目标是让控制权尽量留在用户手里：

- 写文件、执行命令这类敏感操作，可以先拦截，再由你决定是否放行。
- Gateway 在本地运行，不经过中间托管服务。
- 命令默认在当前工作区上下文中执行，也可以继续加限制。

即便如此，它本质上仍然是“远程模型 + 本地工具”的桥接层，工具权限需要你自己认真控制。

## 安装

### VS Code 扩展

在 VS Code Marketplace 中安装 `webcode gateway`。

### 浏览器扩展

1. 从 [Releases](https://github.com/three-water666/webcode/releases) 下载最新的 `webcode-bridge-browser-x.x.x.zip`
2. 解压压缩包
3. 打开浏览器扩展页面：
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
4. 打开开发者模式
5. 点击 `加载已解压的扩展程序`，选择解压后的目录

## 快速开始

### 1. 启动 Gateway

1. 打开 VS Code。
2. 点击右下角状态栏里的 `webcode: 关闭`。
3. 在弹出的菜单里点击 `启动 webcode`。
4. 等待状态栏文字变成 `webcode: <端口>`。

当状态栏显示端口号时，说明本地 Gateway 已经启动。

### 2. 打开目标网页 AI

1. 点击状态栏里的 `webcode: <端口>`。
2. 选择你要打开的目标站点，例如 `Open Gemini`、`Open ChatGPT` 或其他支持的入口。
3. webcode 会先在已配置的浏览器中打开桥接页。
4. 桥接页会自动与本地 Gateway 完成握手。
5. 握手成功后，浏览器会自动跳转到对应的 AI 站点。

当浏览器扩展显示 `ON` 时，表示连接已经可以使用。

### 3. 在对话中使用

1. 打开目标 AI 站点中的新对话。
2. 先输入你的实际需求，再在同一条消息末尾添加 `/webcode` 或 `@webcode`。
3. 当 webcode 询问是否添加初始化提示词时，点击 `添加` 或按 Enter。
4. webcode 会把触发词替换为初始化提示词。确认消息内容后，由你手动发送。

例如：

- `读取 src/utils.ts，然后为它补一个单元测试。 /webcode`
- `列出当前工作区的文件结构。 @webcode`
- `把项目文档生成到 docs 目录里。 /webcode`

## 工作区技能

webcode 可以把当前 VS Code 工作区中的本地技能暴露给网页模型。

默认扫描目录：

- `.agents/skills`
- `.codex/skills`
- `skills`

只要目录里包含 `SKILL.md`，就会被视为一个技能。

推荐的加载流程是：

1. 先调用 `list_skills` 或 `search_skills`
2. 再对目标技能调用 `get_skill`
3. 只有当技能引用了 `references/`、`templates/`、`scripts/` 等额外资源时，再调用 `get_skill_resource`

示例结构：

```text
.agents/
  skills/
    my-skill/
      SKILL.md
      references/
        examples.md
```

你也可以通过 VS Code 配置项 `webcodeGateway.skillDirectories` 自定义扫描路径。

## 从源码构建

### 环境要求

- Node.js 18+
- VS Code

### 1. 克隆仓库

```bash
git clone git@github.com:three-water666/webcode.git
cd webcode
```

### 2. 构建

构建脚本会同时生成 VS Code 扩展包（`.vsix`）和浏览器扩展包（`.zip`）。

macOS / Linux：

```bash
chmod +x build_release.sh
./build_release.sh
```

Windows PowerShell：

```powershell
.\build_release.ps1
```

构建产物会输出到 `release/` 目录。

### 3. 本地安装与调试

- VS Code：打开扩展页，点击 `...`，然后选择 `Install from VSIX...`
- 浏览器：打开扩展页，开启开发者模式，点击 `加载已解压的扩展程序`，选择 `release/` 下解压后的目录，或直接选择 `bridge-browser`

## 参与贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

[MIT License](LICENSE)
