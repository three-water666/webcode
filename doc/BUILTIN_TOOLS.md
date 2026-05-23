# webcode Built-in Tools

这份文档只统计 webcode 自身提供的工具，不包含用户在 `webcodeGateway.servers` 中额外配置的第三方 MCP server。

运行时来源：

- `internal`：`gateway-vscode/src/tools/` 中直接实现的 VS Code 本地工具。
- `client`：`bridge-browser/src/content/main.ts` 在浏览器侧识别的虚拟工具。

## 1. Gateway local tools

这些工具由 `gateway-vscode/src/tools/` 直接实现，并注入到初始化提示词的 Available Tools 列表中。文件能力不再通过 `@modelcontextprotocol/server-filesystem` 启动。
裸工具名只属于这些本地工具；第三方 MCP server 暴露的工具会以 `serverId:toolName` 的形式出现在工具列表中。

| 工具名 | 作用 |
| --- | --- |
| `read_file` | 读取 workspace 内的 UTF-8 文本文件，可用 `head`、`tail`、`start_line`、`end_line`、`show_line_numbers` 读取指定范围并显示行号。未指定范围时会对大文件默认截断，可用 `force` 强制全量返回。 |
| `write_file` | 创建或完全覆盖 workspace 内的 UTF-8 文本文件。 |
| `edit_file` | 对 workspace 内文本文件做精确文本替换或应用 unified diff patch，可用 `dryRun` 返回 diff 预览。 |
| `search_files` | 按文件名或相对路径搜索文件，基于 VS Code 文件搜索，支持简单 glob。 |
| `search_code` | 基于 ripgrep 在 workspace 文本文件中搜索代码内容，返回相对路径、行号和命中行。 |
| `execute_command` | 在后台执行短生命周期 POSIX/bash 命令并返回 stdout/stderr/exitCode，适用于构建、测试、git、包管理器和项目脚本。读取或搜索文件应优先使用 `read_file`、`search_files`、`search_code`。 |
| `run_in_terminal` | 在 VS Code 可见终端会话中启动一条长时间运行的 POSIX shell 命令，立即返回 `session_id`，适合常驻任务或需要用户可见输出的任务。Windows 上要求 Git Bash，命令应使用 bash/POSIX 语法，而不是 cmd.exe 或 PowerShell 语法；明显破坏性、提权或 shell 逃逸类命令会在执行前被拒绝。 |
| `terminal_session` | 管理由 `run_in_terminal` 创建的终端会话：`action=list` 查看状态，`action=read` 读取输出，`action=stop` 停止会话。 |

## 2. Bootstrap-only tools

这些工具只供 VS Code 网关和浏览器插件初始化会话时使用，不会出现在 Available Tools 中，模型直接调用时会被浏览器插件拒绝。

| 工具名 | 作用 |
| --- | --- |
| `get_project_rules` | 读取 workspace 根目录中的 `USER_RULES.md`、`AGENTS.md` 或 `CLAUDE.md`，用于组装初始化提示词。 |
| `list_tools` | 返回模型可用工具列表，按 server 分组，每个工具都包含完整 schema，用于组装初始化提示词。 |
| `list_skills` | 列出当前 workspace 中发现的本地 skills，用于组装初始化提示词中的 Available Skills；每项包含 workspace-relative、`/` 分隔的 `skillFilePath`，可直接交给 `read_file` 读取 `SKILL.md`。 |

## 3. Browser client virtual tools

这些能力不来自 MCP server，而是 `bridge-browser/src/content/main.ts` 在网页侧识别。

| 工具名 | 作用 |
| --- | --- |
| `webcode_init` | 初始化虚拟工具。浏览器捕获后会调用 bootstrap-only tools，把系统 prompt、工具列表和 skill 列表回填到对话框。实际名称来自 `shared/src/index.ts` 的 `PROTOCOL.initToolName`。 |

## 4. 不在本文档统计范围内的工具

- 用户通过 `webcodeGateway.servers` 配置挂载的第三方 MCP servers。
- 第三方 MCP server 提供的 Git、数据库、浏览器自动化、远程 API 等工具。调用时使用 `serverId:toolName`，例如 `github:search_repositories`。
- VS Code 命令面板命令、状态栏操作、浏览器插件 UI 操作。

模型可用的当前运行时工具清单以初始化提示词中的 Available Tools 为准。
