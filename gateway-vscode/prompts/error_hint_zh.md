❌ **格式错误警告 (Format Error)**

你的模型响应内容不符合要求。顶层字段只能包含 `mcp_action`、`name`、`purpose`、`arguments`、`request_id`。`name` 和 `purpose` 必填；如果所选工具有入参，`arguments` 必须严格匹配该工具的 `inputSchema`。`request_id` 必须是本会话中每次工具调用的新值。

```json
{
  "mcp_action": "call",
  "name": "工具名称",
  "purpose": "原因",
  "arguments": {
    "key": "value"
  },
  "request_id": "turn_unique_step_x"
}
```

请根据上述正确格式重新生成指令。
