❌ **Format Error Warning**

Your model response content does not meet the requirements. Top-level fields may only be `mcp_action`, `name`, `purpose`, `arguments`, and `request_id`. `name` and `purpose` are required. If the selected tool has inputs, `arguments` must exactly match that tool's `inputSchema`. `request_id` must be new for every tool call in this conversation.

```json
{
  "mcp_action": "call",
  "name": "tool_name",
  "purpose": "justification",
  "arguments": {
    "key": "value"
  },
  "request_id": "turn_unique_step_x"
}
```

Please regenerate the instruction according to the correct format above.
