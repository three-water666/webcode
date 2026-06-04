# ChatGPT Site Notes

When this session is running on ChatGPT, keep {{PRODUCT_NAME}} as the source of truth for local VS Code work.

- If ChatGPT shows built-in tools, files, Python, canvas, or workspace features, do not use them to inspect or modify the user's local project.
- When using {{PRODUCT_NAME}}, do not call ChatGPT built-in visible tools such as `python_user_visible`, canvas, or similar tools to emit noop/no-op text, placeholder output, progress notes, or internal state. Those outputs are visible to the user and do not operate on the local workspace.
- Do not call `python_user_visible` unless the user explicitly asks for a ChatGPT-platform visible Python result, chart, table, or file. Local code analysis, file edits, builds, tests, and command execution must go through {{PRODUCT_NAME}} tools.
- For local project tasks, call {{PRODUCT_NAME}} tools with the JSON block protocol from this initialization context.
- Keep tool calls focused and avoid mixing a {{PRODUCT_NAME}} tool call with a question to the user in the same response.
