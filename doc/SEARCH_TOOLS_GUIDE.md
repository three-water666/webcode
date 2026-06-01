# search_files 与 search_code 设计说明

本文说明 `search_files` 和 `search_code` 两个内置搜索工具的目标、参数语义、底层实现和已知边界，方便开发者维护，也方便用户理解 AI 在 workspace 中查找文件和代码时发生了什么。

## 背景

webcode 早期的文件查找和代码查找采用了两套不同实现：

- `search_files` 基于 VS Code `workspace.findFiles`，先用 query 生成 include glob，再做二次过滤。
- `search_code` 基于 ripgrep 搜索文件内容，并在 ripgrep 不可用时使用进程内 fallback。

这会导致 `search_files` 在一些场景下不够稳定。例如用户输入 `webfetch`，实际目录叫 `WebFetchTool`，二次过滤虽然不区分大小写，但 VS Code include glob 阶段可能已经没有把候选文件取回来。

优化后的目标是：

- 文件搜索和代码搜索都优先复用 ripgrep。
- 工具参数表达清晰，不暴露 shell 命令和跨平台 quoting 细节。
- 搜索结果不因是否安装了 ripgrep 而改变语义。
- 默认限制输出量，避免一次搜索占满模型上下文。

## 工具定位

### search_files

`search_files` 用于按文件名或 workspace 相对路径查找文件。它不读取文件内容，只返回匹配文件路径。

适合：

- 不确定文件准确路径时先定位文件。
- 查找某类文件，例如测试文件、配置文件、组件文件。
- 列出某个目录下可读文件。
- 在编辑或读取前确认目标路径。

### search_code

`search_code` 用于搜索文件内容。它返回 workspace 相对路径、行号和命中行。

适合：

- 查找函数、变量、配置项、错误信息等文本。
- 根据入口关键词追踪调用链。
- 在读取大文件前先定位相关行号。
- 搜索打包后或长文件中的关键片段。

## search_files 参数语义

常用参数：

| 参数 | 说明 |
| --- | --- |
| `path` | 搜索根目录，默认 `.`。必须是 workspace 内的单个目录。 |
| `query` | 文件名或相对路径查询，默认 `*`，表示列出 `path` 下文件。 |
| `match` | query 解释方式：`auto`、`substring`、`glob`，默认 `auto`。 |
| `case_sensitive` | 是否区分大小写，默认 `false`。 |
| `max_results` | 最多返回多少个匹配文件，默认 200。 |
| `exclude_patterns` | 额外排除的 glob 模式，会和内置默认排除目录合并，完整列表见“排除规则”。通常按本次 `path` 搜索根下的相对路径生效；裸名称会扩展为任意层级匹配。 |

### path

`path` 是搜索根目录，不是匹配条件。

示例：

```json
{
  "path": "gateway-vscode/src/tools",
  "query": "*"
}
```

这表示列出 `gateway-vscode/src/tools` 下符合规则的文件。

支持：

- `.`：workspace 根目录。
- `gateway-vscode/src/tools`：workspace 相对目录。
- workspace 内的绝对路径。

不支持：

- 多个目录。
- `|` 分隔目录。
- glob 目录，例如 `src/**`。
- 指向文件的路径。

### query

`query` 是文件名或相对路径匹配条件。未提供或为空时等价于 `*`。

`query: "*"` 表示列出文件，不是普通星号字符。

`query: "."` 只是字面量点号，通常会匹配带扩展名的文件，但不等价于当前目录。

`query: "foo|bar"` 中的 `|` 不表示 OR，只是普通字符。简单多选应使用 glob brace，例如 `*{foo,bar}*`。

## search_files match 模式

### auto

默认模式。规则是：

- query 含 `*`、`?`、`{`、`}` 时按 glob 解释。
- 其他情况按普通子串解释。

示例：

```json
{
  "query": "searchFiles"
}
```

按普通子串搜索。

```json
{
  "query": "**/*.test.ts"
}
```

按 glob 搜索。

### substring

强制把 query 当普通字面子串。不会解释 `*`、`?`、`{}`。

示例：

```json
{
  "query": "WebFetch",
  "match": "substring"
}
```

默认不区分大小写，因此也能匹配 `webfetch`、`WEBFETCH` 等大小写变体。

### glob

强制把 query 当 glob。

常见示例：

| query | 含义 |
| --- | --- |
| `*` | 匹配所有文件。 |
| `*.ts` | 匹配当前搜索根下所有 `.ts` 文件，实际对文件名也会匹配。 |
| `**/*.test.ts` | 匹配所有测试文件。 |
| `src/**/*.ts` | 匹配 `src` 下所有层级的 `.ts` 文件。 |
| `*.{ts,tsx}` | 匹配 `.ts` 或 `.tsx` 文件。 |
| `*{foo,bar}*` | 匹配路径或文件名中包含 `foo` 或 `bar` 的文件。 |

## search_code 参数语义

常用参数：

| 参数 | 说明 |
| --- | --- |
| `path` | 搜索根目录，默认 `.`。必须是 workspace 内目录。 |
| `query` | 要搜索的文本。 |
| `match` | query 解释方式：`substring` 或 `regex`，默认 `substring`。 |
| `include` | 可选 include glob，例如 `**/*.ts`。 |
| `case_sensitive` | 是否区分大小写，默认 `false`。 |
| `max_results` | 最多返回多少条命中行，默认 100。 |
| `max_line_chars` | 每条命中行最多返回多少字符，默认 500。 |
| `exclude_patterns` | 额外排除的 glob 模式，会和内置默认排除目录合并，完整列表见“排除规则”。通常按本次 `path` 搜索根下的相对路径生效；裸名称会扩展为任意层级匹配。 |

`search_code` 不再使用 `use_regex`。是否启用正则只由 `match` 控制。

## search_code match 模式

### substring

默认模式。query 按字面文本做“包含匹配”。

示例：

```json
{
  "query": "preventDefault"
}
```

可以命中：

```ts
event.preventDefault();
```

在该模式下：

- `.` 是普通点号。
- `|` 是普通竖线。
- `*` 是普通星号。
- `(`、`)`、`[`、`]` 都是普通字符。
- 如果 query 写了 `|`、`.*`、分组、字符类、`\b` 等正则语法，必须传 `match: "regex"`。

### regex

`match: "regex"` 时，query 按 ripgrep 正则表达式解释。

示例：

```json
{
  "query": "preventDefault|stopPropagation",
  "match": "regex"
}
```

可以匹配 `preventDefault` 或 `stopPropagation`。

更多示例：

| query | 含义 |
| --- | --- |
| `function\\s+\\w+` | 匹配函数声明片段。 |
| `search_(files|code)` | 匹配 `search_files` 或 `search_code`。 |
| `\\brequest_id\\b` | 匹配完整词 `request_id`。 |

注意：ripgrep 可用时使用 ripgrep 正则；ripgrep 不可用时 fallback 使用 JavaScript `RegExp`。两者在少数高级正则语法上可能不完全一致。

## 大小写规则

两个搜索工具默认都不区分大小写：

```json
{
  "query": "webfetch"
}
```

可以匹配 `WebFetchTool`。

需要严格大小写时传：

```json
{
  "query": "WebFetch",
  "case_sensitive": true
}
```

## 排除规则

`exclude_patterns` 不会覆盖默认排除项，而是与默认排除项合并。

内置默认排除目录包括：

- `.git`
- `node_modules`
- `.pnpm-store`
- `.vscode-test`
- `.next`
- `.nuxt`
- `.svelte-kit`
- `.turbo`
- `.cache`
- `.parcel-cache`
- `.pytest_cache`
- `.mypy_cache`
- `.ruff_cache`
- `.tox`
- `.venv`
- `venv`
- `.gradle`
- `dist`
- `out`
- `build`
- `target`
- `coverage`

因此实际排除集合是：

```text
内置默认排除目录 + exclude_patterns
```

### 默认排除目录的生效范围

默认排除目录用于阻止搜索从当前搜索根继续递归进入这些目录。它不会阻止用户把 `path` 直接设置到这些目录内部。

例如，从 workspace 根目录搜索：

```json
{
  "path": ".",
  "query": "react"
}
```

默认不会进入 `node_modules`。

但明确搜索某个库：

```json
{
  "path": "node_modules/react",
  "query": "*"
}
```

可以列出 `node_modules/react` 下的文件。此时默认排除规则不会因为搜索根本身位于 `node_modules` 而拒绝整个搜索；但如果这个目录里面还有嵌套的 `node_modules`、`dist`、`build` 等默认排除目录，仍会被跳过。

### exclude_patterns 的匹配基准

`exclude_patterns` 推荐按本次 `path` 搜索根下的相对路径来写。

例如：

```json
{
  "path": "gateway-vscode/src",
  "query": "*.ts",
  "exclude_patterns": ["**/*.test.ts"]
}
```

会排除 `gateway-vscode/src` 下任意层级的 `.test.ts`。

如果 pattern 不含 `/` 且不含 glob 语法，会被扩展为“任意层级同名文件或目录”：

```json
{
  "exclude_patterns": ["fixtures"]
}
```

会按类似下面的规则处理：

```text
fixtures
**/fixtures
**/fixtures/**
```

因此裸名称适合排除某个目录名或文件名。

如果 pattern 包含 `/`，它通常按搜索根相对路径匹配：

```json
{
  "path": "node_modules/react",
  "exclude_patterns": ["cjs/**"]
}
```

会排除 `node_modules/react/cjs` 下的文件。

需要注意：如果已经把 `path` 设到某个子目录里，再写 workspace 根目录风格的排除路径，可能不会按预期生效。

例如：

```json
{
  "path": "node_modules/react",
  "exclude_patterns": ["node_modules/react/cjs/**"]
}
```

对 `search_code` 来说，这类 pattern 通常不会匹配，因为 ripgrep 看到的是相对 `node_modules/react` 的路径，例如 `cjs/react.development.js`，而不是 `node_modules/react/cjs/react.development.js`。

推荐写法是：

```json
{
  "path": "node_modules/react",
  "exclude_patterns": ["cjs/**"]
}
```

`search_files` 在最终结果过滤时会同时检查搜索根相对路径和 workspace 相对路径，因此对某些 workspace 根目录风格 pattern 更宽容；但为了让 `search_files` 和 `search_code` 心智一致，仍推荐按当前 `path` 内的相对路径写。

示例：

```json
{
  "query": "*.ts",
  "exclude_patterns": ["**/*.test.ts"]
}
```

这会在默认排除目录之外，再排除所有 `.test.ts` 文件。

### rg ignore 文件行为

`exclude_patterns` 是 webcode 工具参数；`.gitignore`、`.ignore`、`.rgignore` 是 ripgrep/git 的 ignore 机制。两个搜索工具在这里有意保持不同策略：

| 工具 | ripgrep ignore 行为 | 原因 |
| --- | --- | --- |
| `search_files` | 使用 `rg --files --no-ignore`，不尊重 `.gitignore`、`.ignore`、`.rgignore` 或全局 ignore。 | 文件发现要尽量完整，并和 fallback walker 行为一致。 |
| `search_code` | 使用 ripgrep 默认 ignore 行为，会尊重 `.gitignore`、`.ignore`、`.rgignore` 等。 | 内容搜索更容易扫到大量生成文件或依赖源码，默认遵守项目 ignore 更稳。 |

因此：

- 想“发现文件是否存在”，优先用 `search_files`。
- 想“搜索被 ignore 文件的内容”，如果已知路径，优先用 `read_file` 直接读取。
- 想看默认排除目录里的依赖源码，把 `path` 直接设置到具体库目录，例如 `node_modules/react`。

## ripgrep 与 fallback

两个工具都优先使用 ripgrep。ripgrep 发现顺序是：

1. `webcodeGateway.ripgrep.path` 用户配置。
2. VS Code bundled ripgrep。
3. PATH 中的 `rg`。

如果 ripgrep 启动失败：

- `search_code` 使用进程内文本扫描 fallback。
- `search_files` 使用 workspace 文件遍历 fallback。

fallback 的目标是保持工具可用，但速度和能力可能弱于 ripgrep。

## search_files 与 .gitignore

`search_files` 的 ripgrep 文件枚举会传 `--no-ignore`。这意味着它不依赖 `.gitignore`、`.ignore`、`.rgignore` 或全局 ignore 文件决定候选列表。

原因是 fallback walker 本身不读取 `.gitignore`。如果 ripgrep 路径尊重 `.gitignore`，而 fallback 路径不尊重，就会出现“有 rg 时搜不到、没 rg 时搜得到”的不一致。

因此 `search_files` 的文件可见性由 webcode 自己控制：

```text
workspace 范围 + 内置默认排除目录 + exclude_patterns
```

而不是由 git ignore 文件控制。

## 输出格式

### search_files

返回匹配文件的 workspace 相对路径，每行一个：

```text
gateway-vscode/src/tools/searchFilesTool.ts
gateway-vscode/src/unit-test/searchFilesTool.test.ts
```

无匹配时，会返回搜索参数摘要和常见误用提示。例如：

```text
No matches found.
Searched path: .
Query: .
Match: auto (substring)
Case sensitive: false
Hint: query "." matches a literal dot. Use query "*" to list files.
```

### search_code

返回格式是：

```text
relative/path.ts:123: matching line text
```

长行会围绕命中位置截断，并提示省略字符数量，避免大文件或打包文件撑爆上下文。

无匹配时，如果 query 看起来像正则但当前是默认 substring 模式，输出会附带提示：

```text
No matches found.
Hint: query looks like a regular expression. Did you mean to set match: "regex"?
```

## 推荐使用方式

先用 `search_files` 定位文件，再用 `read_file` 读取：

```json
{
  "query": "searchFilesTool",
  "match": "substring"
}
```

找到文件后：

```json
{
  "path": "gateway-vscode/src/tools/searchFilesTool.ts",
  "start_line": 1,
  "end_line": 120,
  "show_line_numbers": true
}
```

先用 `search_code` 定位行号，再用 `read_file` 读取上下文：

```json
{
  "query": "createRipgrepFilesArgs",
  "match": "substring"
}
```

然后按返回行号读取附近范围。

## 已知边界

- `search_code` 当前只返回命中行，不返回前后文。需要上下文时继续用 `read_file` 按行号读取。
- `search_files` 暂不支持 `queries: []` 多 query 字段。简单 OR 可用 glob brace，例如 `*{foo,bar}*`。
- `path` 只支持单个目录，不支持多目录或 glob 目录。
- `exclude_patterns` 只能增加排除项，不能关闭内置默认排除目录。
- `search_code` fallback 会跳过过大的文件和二进制文件，能力弱于 ripgrep。
- `search_code` 正则 fallback 使用 JavaScript `RegExp`，和 ripgrep 正则存在少数语法差异。

## 后续可扩展方向

- 给 `search_code` 增加 `context_lines`，直接返回命中行前后文。
- 给 `search_files` 增加 `queries`，支持多个查询条件，不依赖 glob brace。
- 增加 `use_default_excludes: false`，允许高级用户搜索 `dist`、`build` 等默认排除目录。
- 增加更结构化的返回内容，例如总候选数、是否截断、实际匹配模式。
- 为 `search_code` 正则模式补充更多 ripgrep 与 fallback 差异测试。
