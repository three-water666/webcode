import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
    matchesPattern,
    normalizeLineEndings,
    toPosixPath,
    walkWorkspaceFiles
} from './filesystemUtils';
import { listGitSearchFiles, sortSearchCandidatesByRelativePath, type SearchCandidateFile } from './searchCodeGitFiles';
import {
    formatSearchCodeMatch,
    isGitMetadataPath,
    type SearchMatchRange
} from './searchCodeUtils';
import type { SearchCodeOptions } from './searchCodeTypes';

const MAX_FALLBACK_FILE_SIZE_BYTES = 1024 * 1024 * 2;
type FallbackMatcher = (line: string) => SearchMatchRange | null;

export type SearchCodeInProcessResult = {
    matches: string[];
    limited: boolean;
};

export function createSearchCodeFallbackNotice(): string {
    return [
        'Notice: ripgrep is unavailable, so search_code is using the in-process fallback.',
        'Fallback scope: fixed-string search and JavaScript RegExp search are supported.',
        'File globs support *, ?, **, and simple comma brace alternation such as *.{js,ts}.',
        'The fallback scans files in stable path order.',
        'Files larger than ' + MAX_FALLBACK_FILE_SIZE_BYTES + ' bytes and binary-looking files are skipped.'
    ].join('\n');
}

export async function searchCodeInProcess(options: SearchCodeOptions): Promise<SearchCodeInProcessResult> {
    const matcher = createFallbackMatcher(options.query, {
        caseSensitive: options.caseSensitive,
        useRegex: options.useRegex
    });
    const matches: string[] = [];
    let limited = false;
    const gitFiles = await listGitSearchFiles(options.searchRoot);

    if (gitFiles) {
        for (const candidate of sortSearchCandidatesByRelativePath(gitFiles)) {
            if (shouldSkipFallbackCandidate(candidate, options)) {
                continue;
            }

            const shouldStop = await appendInProcessFileMatches(
                candidate.filePath,
                candidate.relativeToSearchRoot,
                options,
                matcher,
                matches
            );
            if (shouldStop) {
                limited = true;
                break;
            }
        }

        return { matches, limited };
    }

    const candidates: SearchCandidateFile[] = [];
    await walkWorkspaceFiles(options.searchRoot, (filePath, relativeToSearchRoot) => {
        candidates.push({ filePath, relativeToSearchRoot });
        return Promise.resolve(false);
    }, {
        includePattern: options.includePattern
    });

    for (const candidate of sortSearchCandidatesByRelativePath(candidates)) {
        const shouldStop = await appendInProcessFileMatches(
            candidate.filePath,
            candidate.relativeToSearchRoot,
            options,
            matcher,
            matches
        );
        if (shouldStop) {
            limited = true;
            break;
        }
    }

    return { matches, limited };
}

async function appendInProcessFileMatches(
    filePath: string,
    relativeToSearchRoot: string,
    options: SearchCodeOptions,
    matcher: FallbackMatcher,
    matches: string[]
): Promise<boolean> {
    const relativePath = toPosixPath(path.relative(options.workspaceRoot, filePath));
    if (isGitMetadataPath(relativePath)) {
        return false;
    }
    if (!matchesFallbackInclude(filePath, relativeToSearchRoot, options.includePattern)) {
        return false;
    }

    const stats = await fsPromises.stat(filePath).catch(() => null);
    if (!stats?.isFile() || stats.size > MAX_FALLBACK_FILE_SIZE_BYTES) {
        return false;
    }

    const rawContent = await fsPromises.readFile(filePath, 'utf8').catch(() => null);
    if (rawContent == null || rawContent.includes('\0')) {
        return false;
    }

    const lines = normalizeLineEndings(rawContent).split('\n');
    for (let index = 0; index < lines.length; index++) {
        const matchRange = matcher(lines[index]);
        if (!matchRange) {
            continue;
        }

        const lineText = lines[index];
        matches.push(formatSearchCodeMatch(relativePath, index + 1, lineText, options, matchRange));
        if (matches.length >= options.maxResults) {
            return true;
        }
    }

    return false;
}

function matchesFallbackInclude(
    filePath: string,
    relativeToSearchRoot: string,
    includePattern: string | undefined
): boolean {
    return !includePattern ||
        matchesPattern(relativeToSearchRoot, includePattern) ||
        matchesPattern(path.basename(filePath), includePattern);
}

function shouldSkipFallbackCandidate(
    candidate: SearchCandidateFile,
    options: SearchCodeOptions
): boolean {
    if (isGitMetadataPath(candidate.relativeToSearchRoot)) {
        return true;
    }

    return Boolean(
        options.includePattern &&
        !matchesPattern(candidate.relativeToSearchRoot, options.includePattern) &&
        !matchesPattern(path.basename(candidate.filePath), options.includePattern)
    );
}

function createFallbackMatcher(query: string, options: { caseSensitive: boolean; useRegex: boolean }): FallbackMatcher {
    if (options.useRegex) {
        const flags = options.caseSensitive ? '' : 'i';
        const regex = new RegExp(query, flags);
        return line => {
            const match = regex.exec(line);
            return match ? { start: match.index, end: match.index + match[0].length } : null;
        };
    }

    const needle = options.caseSensitive ? query : query.toLowerCase();
    return line => {
        const haystack = options.caseSensitive ? line : line.toLowerCase();
        const start = haystack.indexOf(needle);
        return start >= 0 ? { start, end: start + needle.length } : null;
    };
}
