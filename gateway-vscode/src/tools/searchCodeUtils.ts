import {
    DEFAULT_EXCLUDED_DIRECTORIES,
    getNumberArg,
    toPosixPath
} from './filesystemUtils';

export const DEFAULT_MATCH_LINE_MAX_CHARS = 500;
export const MIN_MATCH_LINE_MAX_CHARS = 80;
export const MAX_MATCH_LINE_MAX_CHARS = 5000;

export type SearchMatchRange = {
    start: number;
    end: number;
};

type SearchLineFormatOptions = {
    query: string;
    caseSensitive: boolean;
    useRegex: boolean;
    matchLineMaxChars: number;
};

export function getBoundedSearchLineMaxChars(value: unknown): number {
    const numberValue = Math.floor(getNumberArg(value, DEFAULT_MATCH_LINE_MAX_CHARS));
    return Math.min(MAX_MATCH_LINE_MAX_CHARS, Math.max(MIN_MATCH_LINE_MAX_CHARS, numberValue));
}

export function getSearchCodeUseRegex(args: Record<string, unknown>): boolean {
    const match = args.match;
    const useRegex = args.use_regex;

    if (match === undefined) {
        return useRegex === true;
    }
    if (match !== 'substring' && match !== 'regex') {
        throw new Error('match must be "substring" or "regex".');
    }
    if (typeof useRegex === 'boolean' && useRegex !== (match === 'regex')) {
        throw new Error('match and use_regex conflict. Use only match, or make both values agree.');
    }

    return match === 'regex';
}

export function normalizeIncludeGlob(pattern: string | undefined): string | undefined {
    const normalized = typeof pattern === 'string' ? toPosixPath(pattern.trim()) : '';
    if (!normalized) {
        return undefined;
    }

    return normalized.includes('/') ? normalized : `**/${normalized}`;
}

export function createRipgrepExcludeGlobs(excludePatterns: string[]): string[] {
    return [
        ...DEFAULT_EXCLUDED_DIRECTORIES.flatMap(directory => [
            `${directory}/**`,
            `**/${directory}/**`
        ]),
        ...excludePatterns.flatMap(expandUserExcludePattern)
    ];
}

export function formatSearchCodeMatch(
    relativePath: string,
    lineNumber: number,
    lineText: string,
    options: SearchLineFormatOptions,
    matchRange?: SearchMatchRange
): string {
    const range = matchRange ?? findLineMatchRange(lineText, options);
    return `${relativePath}:${lineNumber}: ${truncateSearchMatchLine(lineText, options.matchLineMaxChars, range)}`;
}

export function byteRangeToStringRange(
    text: string,
    startByte: number,
    endByte: number
): SearchMatchRange | undefined {
    const start = byteOffsetToStringIndex(text, startByte);
    const end = byteOffsetToStringIndex(text, endByte);
    if (start === undefined || end === undefined || end < start) {
        return undefined;
    }

    return { start, end };
}

export function truncateSearchMatchLine(
    lineText: string,
    maxChars: number,
    matchRange?: SearchMatchRange
): string {
    if (lineText.length <= maxChars) {
        return lineText;
    }

    const safeMaxChars = Math.max(1, Math.floor(maxChars));
    const start = getSearchPreviewStart(lineText.length, safeMaxChars, matchRange);
    const end = Math.min(start + safeMaxChars, lineText.length);
    const prefix = start > 0 ? `[...${start} chars omitted...] ` : '';
    const suffix = end < lineText.length ? ` [...${lineText.length - end} chars omitted...]` : '';
    return `${prefix}${lineText.slice(start, end)}${suffix}`;
}

function expandUserExcludePattern(pattern: string): string[] {
    const normalized = toPosixPath(pattern.trim());
    if (!normalized) {
        return [];
    }
    if (normalized.includes('/') || hasGlobSyntax(normalized)) {
        return [normalized];
    }

    return [normalized, `**/${normalized}`, `**/${normalized}/**`];
}

function hasGlobSyntax(value: string): boolean {
    return /[*?[\]{}]/.test(value);
}

function byteOffsetToStringIndex(text: string, byteOffset: number): number | undefined {
    if (!Number.isInteger(byteOffset) || byteOffset < 0) {
        return undefined;
    }

    let bytes = 0;
    for (let index = 0; index < text.length; index++) {
        if (bytes >= byteOffset) {
            return index;
        }

        const codePoint = text.codePointAt(index);
        if (codePoint === undefined) {
            return undefined;
        }

        const character = String.fromCodePoint(codePoint);
        const nextBytes = bytes + Buffer.byteLength(character, 'utf8');
        if (nextBytes > byteOffset) {
            return index;
        }

        bytes = nextBytes;
        if (codePoint > 0xFFFF) {
            index++;
        }
    }

    return bytes >= byteOffset ? text.length : undefined;
}

function getSearchPreviewStart(lineLength: number, maxChars: number, matchRange?: SearchMatchRange): number {
    if (!matchRange) {
        return 0;
    }

    const matchStart = Math.min(Math.max(matchRange.start, 0), lineLength);
    const matchEnd = Math.min(Math.max(matchRange.end, matchStart), lineLength);
    const matchCenter = Math.floor((matchStart + matchEnd) / 2);
    const preferredStart = matchCenter - Math.floor(maxChars / 2);
    return Math.min(Math.max(preferredStart, 0), Math.max(lineLength - maxChars, 0));
}

function findLineMatchRange(lineText: string, options: SearchLineFormatOptions): SearchMatchRange | undefined {
    if (!options.useRegex) {
        const haystack = options.caseSensitive ? lineText : lineText.toLowerCase();
        const needle = options.caseSensitive ? options.query : options.query.toLowerCase();
        const start = haystack.indexOf(needle);
        return start >= 0 ? { start, end: start + needle.length } : undefined;
    }

    try {
        const regex = new RegExp(options.query, options.caseSensitive ? '' : 'i');
        const match = regex.exec(lineText);
        return match ? { start: match.index, end: match.index + match[0].length } : undefined;
    } catch {
        return undefined;
    }
}
