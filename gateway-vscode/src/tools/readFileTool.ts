import * as fs from 'fs/promises';
import type { LocalTool } from './types';
import { normalizeLineEndings, resolveWorkspacePath } from './filesystemUtils';
import { readSelectedFileLines, type LineSelectionOptions } from './readFileLineStream';

const DEFAULT_AUTO_READ_MAX_BYTES = 64 * 1024;
const DEFAULT_AUTO_READ_MAX_LINES = 400;

export const readFileTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'read_file',
        description: 'Read a UTF-8 text file inside the current VS Code workspace. Large files are truncated by default unless head, tail, start_line/end_line, or force is provided. Use show_line_numbers to inspect code without shell commands like cat, sed, or nl.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Workspace-relative or absolute path to the file.' },
                head: { type: 'integer', minimum: 1, description: 'Optional number of lines to read from the start of the file.' },
                tail: { type: 'integer', minimum: 1, description: 'Optional number of lines to read from the end of the file.' },
                start_line: { type: 'integer', minimum: 1, description: 'Optional 1-based first line to read. Must be used without head or tail.' },
                end_line: { type: 'integer', minimum: 1, description: 'Optional 1-based last line to read, inclusive. Must be used without head or tail.' },
                show_line_numbers: { type: 'boolean', description: 'Prefix each returned line with its 1-based line number. Default: false.', default: false },
                force: { type: 'boolean', description: 'If true, return the requested content even when the file exceeds the default automatic read limit. Default: false.', default: false }
            },
            required: ['path']
        },
        annotations: { readOnlyHint: true }
    },
    async execute(args, context) {
        const filePath = await resolveWorkspacePath(context.workspaceRoot, args.path);
        const fileStats = await fs.stat(filePath);
        const result = await readFileContent(filePath, fileStats.size, args);
        return {
            content: [{ type: 'text', text: result.text }],
            structuredContent: result.metadata
        };
    }
};

export function selectReadFileContent(content: string, args: Record<string, unknown>): string {
    return selectReadFileResult(content, args).text;
}

type ReadFileResult = {
    text: string;
    metadata: {
        mode: 'full' | 'range' | 'truncated';
        truncated: boolean;
        lineCount?: number;
        returnedLines: {
            start: number;
            end: number;
        };
        returnedBytes?: number;
        fileBytes?: number;
    };
};

export async function readFileContent(
    filePath: string,
    fileBytes: number,
    args: Record<string, unknown>
): Promise<ReadFileResult> {
    const lineOptions = getLineSelectionOptions(args);

    if (args.force === true || fileBytes <= DEFAULT_AUTO_READ_MAX_BYTES) {
        return selectReadFileResult(normalizeLineEndings(await fs.readFile(filePath, 'utf8')), args, { fileBytes });
    }

    if (hasLineSelection(lineOptions)) {
        return readSelectedFileContent(filePath, args, lineOptions, fileBytes);
    }

    const content = normalizeLineEndings(await readFilePrefix(filePath, DEFAULT_AUTO_READ_MAX_BYTES));
    return selectReadFileResult(content, args, {
        fileBytes,
        forceTruncated: true,
        totalLineCountKnown: false
    });
}

export function selectReadFileResult(
    content: string,
    args: Record<string, unknown>,
    options: {
        fileBytes?: number;
        forceTruncated?: boolean;
        totalLineCountKnown?: boolean;
    } = {}
): ReadFileResult {
    const lines = splitLines(content);
    const selection = resolveLineSelection(lines.length, args);
    const showLineNumbers = args.show_line_numbers === true;
    const forceTruncated = options.forceTruncated === true;
    const totalLineCountKnown = options.totalLineCountKnown !== false;

    if (selection) {
        const selected = formatSelectedLines(
            lines.slice(selection.startIndex, selection.endIndex),
            selection.startIndex + 1,
            showLineNumbers
        );
        return {
            text: selected,
            metadata: {
                mode: 'range',
                truncated: false,
                lineCount: totalLineCountKnown ? lines.length : undefined,
                returnedLines: getReturnedLineRange(selection),
                fileBytes: options.fileBytes
            }
        };
    }

    if (!forceTruncated && shouldReturnFullContent(lines, args, options.fileBytes)) {
        return {
            text: showLineNumbers ? formatSelectedLines(lines, 1, true) : content,
            metadata: {
                mode: 'full',
                truncated: false,
                lineCount: lines.length,
                returnedLines: {
                    start: lines.length > 0 ? 1 : 0,
                    end: lines.length
                },
                fileBytes: options.fileBytes
            }
        };
    }

    const truncatedLineCount = Math.min(lines.length, DEFAULT_AUTO_READ_MAX_LINES);
    const truncatedLines = lines.slice(0, truncatedLineCount);
    const text = appendTruncationNotice(
        formatSelectedLines(truncatedLines, 1, showLineNumbers),
        {
            fileBytes: options.fileBytes,
            returnedLines: truncatedLineCount,
            lineCount: totalLineCountKnown ? lines.length : undefined
        }
    );

    return {
        text,
        metadata: {
            mode: 'truncated',
            truncated: true,
            lineCount: totalLineCountKnown ? lines.length : undefined,
            returnedLines: {
                start: truncatedLineCount > 0 ? 1 : 0,
                end: truncatedLineCount
            },
            returnedBytes: Buffer.byteLength(text, 'utf8'),
            fileBytes: options.fileBytes
        }
    };
}

type LineSelection = {
    startIndex: number;
    endIndex: number;
};

function resolveLineSelection(lineCount: number, args: Record<string, unknown>): LineSelection | null {
    const { head, tail, startLine, endLine } = getLineSelectionOptions(args);

    if (head !== undefined) {
        return { startIndex: 0, endIndex: Math.min(head, lineCount) };
    }

    if (tail !== undefined) {
        const startIndex = Math.max(lineCount - tail, 0);
        return { startIndex, endIndex: lineCount };
    }

    if (startLine !== undefined || endLine !== undefined) {
        const startIndex = Math.min(Math.max((startLine ?? 1) - 1, 0), lineCount);
        return {
            startIndex,
            endIndex: Math.min(endLine ?? lineCount, lineCount)
        };
    }

    return null;
}

function getReturnedLineRange(selection: LineSelection): { start: number; end: number } {
    if (selection.startIndex >= selection.endIndex) {
        return { start: 0, end: 0 };
    }

    return {
        start: selection.startIndex + 1,
        end: selection.endIndex
    };
}

async function readSelectedFileContent(
    filePath: string,
    args: Record<string, unknown>,
    options: LineSelectionOptions,
    fileBytes: number
): Promise<ReadFileResult> {
    const selected = await readSelectedFileLines(filePath, options);
    const showLineNumbers = args.show_line_numbers === true;
    const text = formatSelectedLines(selected.lines, selected.startLine, showLineNumbers);

    return {
        text,
        metadata: {
            mode: 'range',
            truncated: false,
            lineCount: selected.lineCount,
            returnedLines: {
                start: selected.lines.length > 0 ? selected.startLine : 0,
                end: selected.lines.length > 0 ? selected.startLine + selected.lines.length - 1 : 0
            },
            fileBytes
        }
    };
}

function getLineSelectionOptions(args: Record<string, unknown>): LineSelectionOptions {
    const options = {
        head: getPositiveIntegerArg(args.head),
        tail: getPositiveIntegerArg(args.tail),
        startLine: getPositiveIntegerArg(args.start_line),
        endLine: getPositiveIntegerArg(args.end_line)
    };
    assertCompatibleLineOptions(options);
    return options;
}

function hasLineSelection(options: LineSelectionOptions): boolean {
    return options.head !== undefined ||
        options.tail !== undefined ||
        options.startLine !== undefined ||
        options.endLine !== undefined;
}

function shouldReturnFullContent(lines: string[], args: Record<string, unknown>, fileBytes?: number): boolean {
    return args.force === true ||
        ((fileBytes === undefined || fileBytes <= DEFAULT_AUTO_READ_MAX_BYTES) && lines.length <= DEFAULT_AUTO_READ_MAX_LINES);
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

export async function readFilePrefix(filePath: string, maxBytes: number, readChunkBytes = maxBytes): Promise<string> {
    const handle = await fs.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(maxBytes);
        let totalBytesRead = 0;

        while (totalBytesRead < maxBytes) {
            const bytesToRead = Math.min(readChunkBytes, maxBytes - totalBytesRead);
            const { bytesRead } = await handle.read(buffer, totalBytesRead, bytesToRead, totalBytesRead);
            if (bytesRead === 0) {
                break;
            }
            totalBytesRead += bytesRead;
        }

        const boundary = totalBytesRead === maxBytes
            ? getUtf8PrefixBoundary(buffer, totalBytesRead)
            : totalBytesRead;
        return buffer.subarray(0, boundary).toString('utf8');
    } finally {
        await handle.close();
    }
}

function getUtf8PrefixBoundary(buffer: Buffer, length: number): number {
    if (length <= 0) {
        return 0;
    }

    let leadIndex = length - 1;
    while (leadIndex >= 0 && isUtf8ContinuationByte(buffer[leadIndex])) {
        leadIndex--;
    }
    if (leadIndex < 0) {
        return 0;
    }

    const sequenceLength = getUtf8SequenceLength(buffer[leadIndex]);
    if (sequenceLength === 0) {
        return leadIndex;
    }

    return length - leadIndex >= sequenceLength ? length : leadIndex;
}

function isUtf8ContinuationByte(byte: number): boolean {
    return (byte & 0b11000000) === 0b10000000;
}

function getUtf8SequenceLength(byte: number): number {
    if ((byte & 0b10000000) === 0) {
        return 1;
    }
    if ((byte & 0b11100000) === 0b11000000) {
        return 2;
    }
    if ((byte & 0b11110000) === 0b11100000) {
        return 3;
    }
    if ((byte & 0b11111000) === 0b11110000) {
        return 4;
    }
    return 0;
}

function splitLines(content: string): string[] {
    if (content === '') {
        return [];
    }
    return content.split('\n');
}

function appendTruncationNotice(
    content: string,
    details: {
        fileBytes?: number;
        returnedLines: number;
        lineCount?: number;
    }
): string {
    const totalLinesText = details.lineCount === undefined ? '' : ` of ${details.lineCount}`;
    const sizeText = details.fileBytes === undefined ? '' : ` File size: ${formatBytes(details.fileBytes)}.`;
    const notice = [
        '',
        `[read_file] File is large; returned lines 1-${details.returnedLines}${totalLinesText} because no line range was provided.${sizeText}`,
        `[read_file] Use start_line/end_line, head, tail, or force: true to read more.`
    ].join('\n');

    return content ? `${content}\n${notice}` : notice.trimStart();
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
