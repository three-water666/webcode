export const READ_FILE_OUTPUT_MAX_BYTES = 128 * 1024;
export const READ_FILE_OUTPUT_MAX_LINES = 1000;

export type ReadFileTruncationReason = 'line_limit' | 'byte_limit' | 'line_and_byte_limit';

export type LimitedReadFileOutput = {
    text: string;
    firstLineNumber: number;
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
        preserveLastLines?: boolean;
    } = {}
): LimitedReadFileOutput {
    const preserveLastLines = limits.preserveLastLines === true;
    const lineLimited = preserveLastLines
        ? lines.slice(Math.max(lines.length - READ_FILE_OUTPUT_MAX_LINES, 0))
        : lines.slice(0, READ_FILE_OUTPUT_MAX_LINES);
    const lineLimitedFirstLineNumber = preserveLastLines
        ? firstLineNumber + lines.length - lineLimited.length
        : firstLineNumber;
    const lineLimitApplied = limits.lineLimitAlreadyApplied === true || lines.length > lineLimited.length;
    const byteLimited = limitTextToMaxBytes(
        lineLimited,
        lineLimitedFirstLineNumber,
        showLineNumbers,
        preserveLastLines
    );
    const byteLimitApplied = limits.byteLimitAlreadyApplied === true || byteLimited.byteLimitApplied;

    return {
        text: byteLimited.text,
        firstLineNumber: byteLimited.firstLineNumber,
        returnedLineCount: byteLimited.returnedLineCount,
        lineLimitApplied,
        byteLimitApplied,
        truncationReason: getReadFileTruncationReason(lineLimitApplied, byteLimitApplied)
    };
}

function limitTextToMaxBytes(
    lines: string[],
    firstLineNumber: number,
    showLineNumbers: boolean,
    preserveLastLines: boolean
): Pick<LimitedReadFileOutput, 'text' | 'firstLineNumber' | 'returnedLineCount' | 'byteLimitApplied'> {
    const text = formatReadFileLines(lines, firstLineNumber, showLineNumbers);
    if (Buffer.byteLength(text, 'utf8') <= READ_FILE_OUTPUT_MAX_BYTES) {
        return { text, firstLineNumber, returnedLineCount: lines.length, byteLimitApplied: false };
    }

    const completeLineCount = getMaxCompleteLineCountWithinByteLimit(
        lines,
        firstLineNumber,
        showLineNumbers,
        preserveLastLines
    );
    if (completeLineCount > 0) {
        const returnedLines = preserveLastLines ? lines.slice(lines.length - completeLineCount) : lines.slice(0, completeLineCount);
        const returnedFirstLineNumber = preserveLastLines
            ? firstLineNumber + lines.length - completeLineCount
            : firstLineNumber;
        return {
            text: formatReadFileLines(returnedLines, returnedFirstLineNumber, showLineNumbers),
            firstLineNumber: returnedFirstLineNumber,
            returnedLineCount: completeLineCount,
            byteLimitApplied: true
        };
    }

    const truncatedLineIndex = preserveLastLines ? lines.length - 1 : 0;
    const truncatedFirstLineNumber = firstLineNumber + truncatedLineIndex;
    return {
        text: truncateUtf8Text(formatReadFileLines([lines[truncatedLineIndex]], truncatedFirstLineNumber, showLineNumbers)),
        firstLineNumber: truncatedFirstLineNumber,
        returnedLineCount: lines.length > 0 ? 1 : 0,
        byteLimitApplied: true
    };
}

function getMaxCompleteLineCountWithinByteLimit(
    lines: string[],
    firstLineNumber: number,
    showLineNumbers: boolean,
    preserveLastLines: boolean
): number {
    let low = 0;
    let high = lines.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const returnedLines = preserveLastLines ? lines.slice(lines.length - mid) : lines.slice(0, mid);
        const returnedFirstLineNumber = preserveLastLines
            ? firstLineNumber + lines.length - mid
            : firstLineNumber;
        const text = formatReadFileLines(returnedLines, returnedFirstLineNumber, showLineNumbers);
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
