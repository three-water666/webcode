import type { ToolResult } from './types';

export function textResult(text: string, isError = false): ToolResult {
    return {
        content: [{ type: 'text', text }],
        structuredContent: { content: text },
        isError
    };
}

export function jsonResult(value: unknown, isError = false): ToolResult {
    return textResult(JSON.stringify(value, null, 2), isError);
}

export function errorResult(message: string): ToolResult {
    return textResult(message, true);
}
