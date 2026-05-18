❌ **Format Error Warning**

Your model response content does not meet the requirements. Top-level fields may only be `mcp_action`, `name`, `purpose`, `arguments`, and `request_id`. `name` and `purpose` are required. If the selected tool has inputs, `arguments` must exactly match that tool's `inputSchema`.

```json
{
  "mcp_action": "call",
  "name": "tool_name",
  "purpose": "justification",
  "arguments": {
    "key": "value"
  },
  "request_id": "step_x"
}
```

For initialization:

```json
{
  "mcp_action": "call",
  "name": "{{INIT_TOOL_NAME}}",
  "purpose": "Initialize {{PRODUCT_NAME}} for this conversation",
  "request_id": "step_1"
}
```

Please regenerate the instruction according to the correct format above.
