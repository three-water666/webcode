# webcode Built-in Tools

This document only covers tools provided by webcode itself. It does not include third-party MCP servers that users add through `webcodeGateway.servers`.

Runtime sources:

- `internal`: local VS Code tools implemented directly in `gateway-vscode/src/tools/`.
- `client`: virtual tools recognized by `bridge-browser/src/content/main.ts` in the browser.

## 1. Gateway Local Tools

These tools are implemented directly in `gateway-vscode/src/tools/` and injected into the Available Tools list in the initialization prompt. File capabilities no longer start through `@modelcontextprotocol/server-filesystem`.

Bare tool names only belong to these local tools. Tools exposed by third-party MCP servers appear in the tool list as `serverId:toolName`.

| Tool | Purpose |
| --- | --- |
| `read_file` | Reads UTF-8 text files inside the workspace. Supports `head`, `tail`, `start_line`, `end_line`, and `show_line_numbers` for ranged reads and line numbers. |
| `write_file` | Creates or fully overwrites UTF-8 text files inside the workspace. |
| `edit_file` | Applies exact text replacements or unified diff patches to text files inside the workspace. Use `dryRun` to return a diff preview. |
| `search_files` | Searches files by filename or relative path using ripgrep file listing first, with substring and glob matching that is case-insensitive by default, and respects ignore files by default. |
| `search_code` | Searches workspace text files with ripgrep and returns relative paths, line numbers, and matching lines; pass `match: "regex"` when using regex syntax. |
| `execute_command` | Runs short-lived POSIX/bash commands in the background and returns stdout, stderr, and exitCode. It is intended for builds, tests, git, package managers, and project scripts. Prefer `read_file`, `search_files`, and `search_code` for reading or searching files. |
| `run_in_terminal` | Starts a long-running POSIX shell command in a visible VS Code terminal session and immediately returns a `session_id`. It is intended for persistent tasks or output that should stay visible to the user. On Windows, Git Bash is required, and commands should use bash/POSIX syntax instead of cmd.exe or PowerShell syntax. Clearly destructive, privileged, or shell-escape commands are rejected before execution. |
| `terminal_session` | Manages terminal sessions created by `run_in_terminal`: use `action=list` to inspect status, `action=read` to read output, and `action=stop` to stop a session. |

## 2. Bootstrap-only Tools

These tools are only used by the VS Code gateway and browser extension when initializing a session. They do not appear in Available Tools, and direct model calls are rejected by the browser extension.

| Tool | Purpose |
| --- | --- |
| `get_project_rules` | Reads `USER_RULES.md`, `AGENTS.md`, or `CLAUDE.md` from the workspace root to assemble the initialization prompt. |
| `list_tools` | Returns the model-available tool list grouped by server. Each tool includes its full schema for the initialization prompt. |
| `list_skills` | Lists local skills discovered in the current workspace for the Available Skills section of the initialization prompt. Each item includes a workspace-relative, `/`-separated `skillFilePath` that can be passed directly to `read_file` to read `SKILL.md`. |

## 3. Browser Client Virtual Tools

These capabilities do not come from an MCP server. They are recognized by `bridge-browser/src/content/main.ts` on the web page.

| Tool | Purpose |
| --- | --- |
| `webcode_init` | Initializes virtual tools and remains available for manually pasted initialization prompts and older flows. After the browser captures it, the browser calls bootstrap-only tools and writes the system prompt, tool list, and skill list back into the chat box. `/webcode` and `@webcode` triggers now generate the same initialization result directly. The actual name comes from `PROTOCOL.initToolName` in `shared/src/index.ts`. |

## 4. Outside This Document

- Third-party MCP servers mounted through `webcodeGateway.servers`.
- Git, database, browser automation, remote API, or other tools provided by third-party MCP servers. Call them as `serverId:toolName`, for example `github:search_repositories`.
- VS Code command palette commands, status bar actions, and browser extension UI actions.

The current runtime tool list available to the model is determined by Available Tools in the initialization prompt.
