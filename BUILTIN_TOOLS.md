# webcode Built-in Tools

这份文档只统计 webcode 自身提供或随 VS Code 扩展自动打包、自动挂载的工具，不包含用户在 `webcodeGateway.servers` 中额外配置的第三方 MCP server。

运行时来源：

- `internal`：`gateway-vscode/src/gateway.ts` 直接处理的网关内部工具。
- `builtin_filesystem`：`gateway-vscode` 自动打包并启动的 `@modelcontextprotocol/server-filesystem`。
- `builtin_command`：`gateway-vscode/src/servers/command.ts` 实现的安全命令执行 MCP server。
- `client`：`bridge-browser/src/content/main.ts` 在浏览器侧识别或注入的虚拟工具。

## 1. Gateway internal tools

这些工具由 `gateway-vscode/src/gateway.ts` 直接实现。除 `list_tools` 这个入口工具外，其余会被注入到 `list_tools` 返回值的 `internal` 分组。

| 工具名 | 作用 |
| --- | --- |
| `list_tools` | 返回当前可用工具列表，按 server 分组，并区分完整 schema 的 `tools` 和只列名称的 `hidden_tools`。 |
| `get_tool_definitions` | 为 `hidden_tools` 中的工具按名称拉取完整 schema，也可返回部分 internal tools 的 schema。 |
| `run_in_terminal` | 在 VS Code 可见终端会话中启动一条长时间运行的 POSIX shell 命令，立即返回 `session_id`，适合常驻任务或需要用户可见输出的任务。Windows 上要求 Git Bash，命令应使用 bash/POSIX 语法，而不是 cmd.exe 或 PowerShell 语法；明显破坏性、提权或 shell 逃逸类命令会在执行前被拒绝。 |
| `list_terminal_sessions` | 列出由 `run_in_terminal` 创建的终端会话。 |
| `get_terminal_session` | 根据 `session_id` 获取终端会话状态、进程、退出码等摘要。 |
| `read_terminal_output` | 读取指定终端会话最近输出，默认返回最近 200 行。 |
| `stop_terminal_session` | 停止指定终端会话并关闭对应 VS Code terminal。 |
| `list_skills` | 列出当前 workspace 中发现的本地 skills。 |
| `search_skills` | 按任务或关键词搜索本地 skills。 |
| `get_skill` | 读取指定 skill 的 `SKILL.md` 内容和资源列表。 |
| `get_skill_resource` | 按需读取 skill 目录下的文本资源文件，例如 `references/`、`templates/`、`scripts/` 中的文件。 |

## 2. Auto-managed bundled MCP servers

`gateway-vscode/src/extension.ts` 的 `getBuiltinServers()` 会自动挂载以下两个 server。旧配置名 `filesystem`、`command`、`builtin_filesystem`、`builtin_command` 如果出现在用户自定义配置里，会被当作 legacy built-in 配置忽略，因为这些能力现在由扩展自动管理。

### `builtin_command`

| 工具名 | 位置 | 作用 |
| --- | --- | --- |
| `execute_command` | `gateway-vscode/src/servers/command.ts` | 在后台执行一条短生命周期 POSIX shell 命令并返回 stdout/stderr/exitCode。Windows 上要求 Git Bash，命令应使用 bash/POSIX 语法，而不是 cmd.exe 或 PowerShell 语法；`cwd` 必须位于当前 workspace 内，明显破坏性、提权或 shell 逃逸类命令会在执行前被拒绝。 |

### `builtin_filesystem`

这些工具来自随扩展打包的 `@modelcontextprotocol/server-filesystem`，webpack 入口为 `gateway-vscode/webpack.config.js` 中的 `filesystemServer`。实际运行时只允许访问当前 workspace 目录及其子目录。

| 工具名 | 作用 |
| --- | --- |
| `read_file` | 读取文本文件完整内容；上游已标记 deprecated，优先使用 `read_text_file`。 |
| `read_text_file` | 读取单个文本文件，可用 `head` 或 `tail` 只读取开头/结尾若干行。 |
| `read_media_file` | 读取图片或音频文件，返回 base64 数据和 MIME type。 |
| `read_multiple_files` | 一次读取多个文本文件，适合批量分析或对比。 |
| `write_file` | 创建或完全覆盖文本文件。 |
| `edit_file` | 对文本文件做精确文本替换，可用 `dryRun` 返回 git-style diff 预览。 |
| `create_directory` | 创建目录；支持递归创建，目录已存在时也会成功。 |
| `list_directory` | 列出目录下的文件和子目录。 |
| `list_directory_with_sizes` | 列出目录内容并显示文件大小，可按名称或大小排序。 |
| `directory_tree` | 递归生成目录树 JSON，可传 `excludePatterns` 排除路径。 |
| `move_file` | 移动或重命名文件/目录，源和目标都必须在允许目录内。 |
| `search_files` | 在目录内按 glob-style pattern 搜索文件或目录。 |
| `get_file_info` | 返回文件或目录元数据，例如大小、创建时间、修改时间、权限和类型。 |
| `list_allowed_directories` | 返回 filesystem server 当前允许访问的目录列表。 |

## 3. Browser client virtual tools

这些能力不来自 MCP server，而是 `bridge-browser/src/content/main.ts` 在网页侧识别或注入。

| 工具名 | 作用 |
| --- | --- |
| `webcode_init` | 初始化虚拟工具。浏览器捕获后会调用 `list_tools` 和 `list_skills`，把系统 prompt、工具列表和 skill 列表回填到对话框。实际名称来自 `shared/src/index.ts` 的 `PROTOCOL.initToolName`。 |
| `task_completion_notification` | 浏览器在处理 `list_tools` 结果时注入到 `client` 分组。调用后触发系统通知，提醒用户任务完成或需要回来查看。 |

## 4. 不在本文档统计范围内的工具

- 用户通过 `webcodeGateway.servers` 配置挂载的第三方 MCP servers。
- 第三方 MCP server 提供的 Git、数据库、浏览器自动化、远程 API 等工具。
- VS Code 命令面板命令、状态栏操作、浏览器插件 UI 操作。

如果要看“当前运行时完整工具清单”，应以模型侧执行 `list_tools` 的返回结果为准。
