❌ **格式错误警告 (Format Error)**

你的模型响应内容不符合要求。请确保你的回复严格遵循以下格式：

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

请根据上述正确格式重新生成指令。