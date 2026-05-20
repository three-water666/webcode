import * as fs from 'fs/promises';
import type { LocalTool } from './types';
import { textResult } from './result';
import { normalizeLineEndings, resolveWorkspacePath } from './filesystemUtils';

export const readFileTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'read_file',
        description: 'Read a UTF-8 text file inside the current VS Code workspace. Use head, tail, start_line/end_line, or show_line_numbers to inspect code without shell commands like cat, sed, or nl.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Workspace-relative or absolute path to the file.' },
                head: { type: 'integer', minimum: 1, description: 'Optional number of lines to read from the start of the file.' },
                tail: { type: 'integer', minimum: 1, description: 'Optional number of lines to read from the end of the file.' },
                start_line: { type: 'integer', minimum: 1, description: 'Optional 1-based first line to read. Must be used without head or tail.' },
                end_line: { type: 'integer', minimum: 1, description: 'Optional 1-based last line to read, inclusive. Must be used without head or tail.' },
                show_line_numbers: { type: 'boolean', description: 'Prefix each returned line with its 1-based line number. Default: false.', default: false }
            },
            required: ['path']
        },
        annotations: { readOnlyHint: true }
    },
    async execute(args, context) {
        const filePath = await resolveWorkspacePath(context.workspaceRoot, args.path);
        const content = normalizeLineEndings(await fs.readFile(filePath, 'utf8'));
        return textResult(selectReadFileContent(content, args));
    }
};

export function selectReadFileContent(content: string, args: Record<string, unknown>): string {
    const lines = content.split('\n');
    const selection = resolveLineSelection(lines.length, args);
    const showLineNumbers = args.show_line_numbers === true;

    if (!selection && !showLineNumbers) {
        return content;
    }

    const startIndex = selection?.startIndex ?? 0;
    const endIndex = selection?.endIndex ?? lines.length;
    return formatSelectedLines(lines.slice(startIndex, endIndex), startIndex + 1, showLineNumbers);
}

type LineSelection = {
    startIndex: number;
    endIndex: number;
};

function resolveLineSelection(lineCount: number, args: Record<string, unknown>): LineSelection | null {
    const head = getPositiveIntegerArg(args.head);
    const tail = getPositiveIntegerArg(args.tail);
    const startLine = getPositiveIntegerArg(args.start_line);
    const endLine = getPositiveIntegerArg(args.end_line);
    assertCompatibleLineOptions({ head, tail, startLine, endLine });

    if (head !== undefined) {
        return { startIndex: 0, endIndex: head };
    }

    if (tail !== undefined) {
        const startIndex = Math.max(lineCount - tail, 0);
        return { startIndex, endIndex: lineCount };
    }

    if (startLine !== undefined || endLine !== undefined) {
        return {
            startIndex: Math.max((startLine ?? 1) - 1, 0),
            endIndex: Math.min(endLine ?? lineCount, lineCount)
        };
    }

    return null;
}

function assertCompatibleLineOptions(options: {
    head?: number;
    tail?: number;
    startLine?: number;
    endLine?: number;
}): void {
    const { head, tail, startLine, endLine } = options;
    const hasRange = startLine !== undefined || endLine !== undefined;
    if (head !== undefined && tail !== undefined) {
        throw new Error('Cannot specify both head and tail.');
    }

    if ((head !== undefined || tail !== undefined) && hasRange) {
        throw new Error('Cannot specify head or tail with start_line or end_line.');
    }

    if (startLine !== undefined && endLine !== undefined && startLine > endLine) {
        throw new Error('start_line must be less than or equal to end_line.');
    }
}

function getPositiveIntegerArg(value: unknown): number | undefined {
    if (typeof value !== 'number') {
        return undefined;
    }

    if (!Number.isInteger(value) || value < 1) {
        throw new Error('Line options must be positive integers.');
    }

    return value;
}

function formatSelectedLines(lines: string[], firstLineNumber: number, showLineNumbers: boolean): string {
    if (!showLineNumbers) {
        return lines.join('\n');
    }

    return lines
        .map((line, index) => `${firstLineNumber + index}: ${line}`)
        .join('\n');
}
