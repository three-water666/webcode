import * as path from 'path';
import { toPosixPath } from './filesystemUtils';
import {
    byteRangeToStringRange,
    formatSearchCodeMatch,
    type SearchMatchRange
} from './searchCodeUtils';
import type { SearchCodeOptions } from './searchCodeTypes';

type RipgrepMatchMessage = {
    type: string;
    data?: {
        path?: { text?: string };
        lines?: { text?: string };
        line_number?: number;
        submatches?: RipgrepSubmatch[];
    };
};

type RipgrepSubmatch = {
    match?: { text?: string };
    start?: number;
    end?: number;
};

type RipgrepSubmatchWithRange = RipgrepSubmatch & {
    start: number;
    end: number;
};

export function appendRipgrepMatch(line: string, options: SearchCodeOptions, matches: string[]): void {
    const trimmed = line.trim();
    if (!trimmed) {
        return;
    }

    let message: RipgrepMatchMessage;
    try {
        message = JSON.parse(trimmed) as RipgrepMatchMessage;
    } catch {
        return;
    }

    if (message.type !== 'match' || !message.data?.path?.text || typeof message.data.line_number !== 'number') {
        return;
    }

    const rawPath = message.data.path.text;
    const absolutePath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(options.searchRoot, rawPath);
    const relativePath = toPosixPath(path.relative(options.workspaceRoot, absolutePath));
    const lineText = stripLineEnding(message.data.lines?.text ?? '');
    const matchRange = getRipgrepMatchRange(lineText, message);
    matches.push(formatSearchCodeMatch(relativePath, message.data.line_number, lineText, options, matchRange));
}

function getRipgrepMatchRange(
    lineText: string,
    message: RipgrepMatchMessage
): SearchMatchRange | undefined {
    const submatch = message.data?.submatches?.find((item): item is RipgrepSubmatchWithRange =>
        typeof item.start === 'number' &&
        typeof item.end === 'number'
    );
    if (!submatch) {
        return undefined;
    }

    return byteRangeToStringRange(lineText, submatch.start, submatch.end);
}

function stripLineEnding(text: string): string {
    return text.replace(/\r?\n$/, '');
}
