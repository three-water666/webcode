import * as fs from 'fs/promises';
import { StringDecoder } from 'string_decoder';

const STREAM_READ_CHUNK_BYTES = 64 * 1024;

export type LineSelectionOptions = {
    head?: number;
    tail?: number;
    startLine?: number;
    endLine?: number;
};

export type SelectedFileLines = {
    lines: string[];
    startLine: number;
    lineCount?: number;
};

type StreamLinesResult = {
    completed: boolean;
    lineCount: number;
};

export async function readSelectedFileLines(
    filePath: string,
    options: LineSelectionOptions
): Promise<SelectedFileLines> {
    return options.tail !== undefined
        ? readTailFileLines(filePath, options.tail)
        : readForwardSelectedFileLines(filePath, options);
}

async function readForwardSelectedFileLines(
    filePath: string,
    options: LineSelectionOptions
): Promise<SelectedFileLines> {
    const startLine = options.head !== undefined ? 1 : options.startLine ?? 1;
    const stopAfterLine = options.head ?? options.endLine;
    const streamResult = await streamForwardSelectedLines(filePath, startLine, stopAfterLine);

    return {
        lines: streamResult.lines,
        startLine,
        lineCount: streamResult.completed ? streamResult.lineCount : undefined
    };
}

async function streamForwardSelectedLines(
    filePath: string,
    startLine: number,
    stopAfterLine?: number
): Promise<StreamLinesResult & { lines: string[] }> {
    const handle = await fs.open(filePath, 'r');
    try {
        const decoder = new StringDecoder('utf8');
        const buffer = Buffer.alloc(STREAM_READ_CHUNK_BYTES);
        const selectedLines: string[] = [];
        let currentLine = '';
        let currentLineNumber = 1;
        let completed = true;
        let sawBytes = false;

        const shouldCaptureCurrentLine = (): boolean => currentLineNumber >= startLine &&
            (stopAfterLine === undefined || currentLineNumber <= stopAfterLine);
        const appendSegment = (segment: string): void => {
            if (shouldCaptureCurrentLine()) {
                currentLine += segment;
            }
        };
        const finishLine = (endedByNewline: boolean): boolean => {
            const finishedLineNumber = currentLineNumber;
            if (shouldCaptureCurrentLine()) {
                selectedLines.push(endedByNewline && currentLine.endsWith('\r') ? currentLine.slice(0, -1) : currentLine);
            }
            currentLine = '';
            currentLineNumber += 1;
            return stopAfterLine !== undefined && finishedLineNumber >= stopAfterLine;
        };
        const processText = (text: string): boolean => {
            let segmentStart = 0;
            let newlineIndex = text.indexOf('\n', segmentStart);

            while (newlineIndex !== -1) {
                appendSegment(text.slice(segmentStart, newlineIndex));
                if (finishLine(true)) {
                    return true;
                }
                segmentStart = newlineIndex + 1;
                newlineIndex = text.indexOf('\n', segmentStart);
            }

            appendSegment(text.slice(segmentStart));
            return false;
        };

        while (true) {
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
            if (bytesRead === 0) {
                break;
            }
            sawBytes = true;
            if (processText(decoder.write(buffer.subarray(0, bytesRead)))) {
                completed = false;
                break;
            }
        }

        if (completed) {
            const remainingText = decoder.end();
            if (remainingText && processText(remainingText)) {
                completed = false;
            }
        }

        if (completed && sawBytes) {
            finishLine(false);
        }

        return {
            completed,
            lineCount: sawBytes ? currentLineNumber - 1 : 0,
            lines: selectedLines
        };
    } finally {
        await handle.close();
    }
}

async function readTailFileLines(filePath: string, tail: number): Promise<SelectedFileLines> {
    const selectedLines: string[] = [];
    const streamResult = await streamFileLines(filePath, line => {
        selectedLines.push(line);
        if (selectedLines.length > tail) {
            selectedLines.shift();
        }
        return false;
    });

    return {
        lines: selectedLines,
        startLine: streamResult.lineCount - selectedLines.length + 1,
        lineCount: streamResult.lineCount
    };
}

async function streamFileLines(
    filePath: string,
    onLine: (line: string, lineNumber: number) => boolean
): Promise<StreamLinesResult> {
    const handle = await fs.open(filePath, 'r');
    try {
        const decoder = new StringDecoder('utf8');
        const buffer = Buffer.alloc(STREAM_READ_CHUNK_BYTES);
        let carry = '';
        let completed = true;
        let sawBytes = false;
        let lineCount = 0;

        const processLine = (line: string, endedByNewline: boolean): boolean => {
            lineCount += 1;
            const normalizedLine = endedByNewline && line.endsWith('\r') ? line.slice(0, -1) : line;
            return onLine(normalizedLine, lineCount);
        };

        const processText = (text: string): boolean => {
            carry += text;
            let newlineIndex = carry.indexOf('\n');

            while (newlineIndex !== -1) {
                const line = carry.slice(0, newlineIndex);
                carry = carry.slice(newlineIndex + 1);
                if (processLine(line, true)) {
                    return true;
                }
                newlineIndex = carry.indexOf('\n');
            }

            return false;
        };

        while (true) {
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
            if (bytesRead === 0) {
                break;
            }
            sawBytes = true;
            if (processText(decoder.write(buffer.subarray(0, bytesRead)))) {
                completed = false;
                break;
            }
        }

        if (completed) {
            const remainingText = decoder.end();
            if (remainingText && processText(remainingText)) {
                completed = false;
            }
        }

        if (completed && sawBytes && processLine(carry, false)) {
            completed = false;
        }

        return { completed, lineCount };
    } finally {
        await handle.close();
    }
}
