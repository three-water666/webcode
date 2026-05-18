❌ **格式错误警告 (Format Error)**

你的模型响应内容不符合要求。顶层字段只能包含 `mcp_action`、`name`、`purpose`、`arguments`、`request_id`。`name` 和 `purpose` 必填；如果所选工具有入参，`arguments` 必须严格匹配该工具的 `inputSchema`。

```json
{
  "mcp_action": "call",
  "name": "工具名称",
  "purpose": "原因",
  "arguments": {
    "key": "value"
  },
  "request_id": "step_x"
}
```

初始化命令格式：

```json
{
  "mcp_action": "call",
  "name": "{{INIT_TOOL_NAME}}",
  "purpose": "初始化本次会话的 {{PRODUCT_NAME}}",
  "request_id": "step_1"
}
```

请根据上述正确格式重新生成指令。
