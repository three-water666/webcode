export const READ_FILE_OUTPUT_MAX_BYTES = 128 * 1024;
export const READ_FILE_OUTPUT_MAX_LINES = 1000;

export type ReadFileTruncationReason = 'line_limit' | 'byte_limit' | 'line_and_byte_limit';

export type LimitedReadFileOutput = {
    text: string;
    returnedLineCount: number;
    lineLimitApplied: boolean;
    byteLimitApplied: boolean;
    truncationReason?: ReadFileTruncationReason;
};

export function formatReadFileLines(lines: string[], firstLineNumber: number, showLineNumbers: boolean): string {
    if (!showLineNumbers) {
        return lines.join('\n');
    }

    return lines
        .map((line, index) => `${firstLineNumber + index}: ${line}`)
        .join('\n');
}

export function formatLimitedReadFileOutput(
    lines: string[],
    firstLineNumber: number,
    showLineNumbers: boolean,
    limits: {
        byteLimitAlreadyApplied?: boolean;
        lineLimitAlreadyApplied?: boolean;
    } = {}
): LimitedReadFileOutput {
    const lineLimited = lines.slice(0, READ_FILE_OUTPUT_MAX_LINES);
    const lineLimitApplied = limits.lineLimitAlreadyApplied === true || lines.length > lineLimited.length;
    const byteLimited = limitTextToMaxBytes(lineLimited, firstLineNumber, showLineNumbers);
    const byteLimitApplied = limits.byteLimitAlreadyApplied === true || byteLimited.byteLimitApplied;

    return {
        text: byteLimited.text,
        returnedLineCount: byteLimited.returnedLineCount,
        lineLimitApplied,
        byteLimitApplied,
        truncationReason: getReadFileTruncationReason(lineLimitApplied, byteLimitApplied)
    };
}

function limitTextToMaxBytes(
    lines: string[],
    firstLineNumber: number,
    showLineNumbers: boolean
): Pick<LimitedReadFileOutput, 'text' | 'returnedLineCount' | 'byteLimitApplied'> {
    const text = formatReadFileLines(lines, firstLineNumber, showLineNumbers);
    if (Buffer.byteLength(text, 'utf8') <= READ_FILE_OUTPUT_MAX_BYTES) {
        return { text, returnedLineCount: lines.length, byteLimitApplied: false };
    }

    const completeLineCount = getMaxCompleteLineCountWithinByteLimit(lines, firstLineNumber, showLineNumbers);
    if (completeLineCount > 0) {
        return {
            text: formatReadFileLines(lines.slice(0, completeLineCount), firstLineNumber, showLineNumbers),
            returnedLineCount: completeLineCount,
            byteLimitApplied: true
        };
    }

    return {
        text: truncateUtf8Text(formatReadFileLines(lines.slice(0, 1), firstLineNumber, showLineNumbers)),
        returnedLineCount: lines.length > 0 ? 1 : 0,
        byteLimitApplied: true
    };
}

function getMaxCompleteLineCountWithinByteLimit(
    lines: string[],
    firstLineNumber: number,
    showLineNumbers: boolean
): number {
    let low = 0;
    let high = lines.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const text = formatReadFileLines(lines.slice(0, mid), firstLineNumber, showLineNumbers);
        if (Buffer.byteLength(text, 'utf8') <= READ_FILE_OUTPUT_MAX_BYTES) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return low;
}

function truncateUtf8Text(text: string): string {
    let bytes = 0;
    let endIndex = 0;
    for (const character of text) {
        const nextBytes = bytes + Buffer.byteLength(character, 'utf8');
        if (nextBytes > READ_FILE_OUTPUT_MAX_BYTES) {
            break;
        }
        bytes = nextBytes;
        endIndex += character.length;
    }
    return text.slice(0, endIndex);
}

function getReadFileTruncationReason(
    lineLimitApplied: boolean,
    byteLimitApplied: boolean
): ReadFileTruncationReason | undefined {
    if (lineLimitApplied && byteLimitApplied) {
        return 'line_and_byte_limit';
    }
    if (lineLimitApplied) {
        return 'line_limit';
    }
    return byteLimitApplied ? 'byte_limit' : undefined;
}
