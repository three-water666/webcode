import { DEFAULT_EXCLUDED_DIRECTORIES, toPosixPath } from './filesystemUtils';

export function createFileSearchIncludePattern(query: string): string {
    if (hasGlobSyntax(query)) {
        return query.includes('/') ? query : `**/${query}`;
    }

    const escapedQuery = escapeFindFilesLiteral(query);
    if (query.includes('/')) {
        return `{**/*${escapedQuery}*,**/*${escapedQuery}*/**}`;
    }

    return `**/*${escapedQuery}*`;
}

export function createFindFilesExcludePattern(excludePatterns: string[]): string | undefined {
    const patterns = [
        ...DEFAULT_EXCLUDED_DIRECTORIES.map(directory => `**/${directory}/**`),
        ...excludePatterns.map(pattern => toPosixPath(pattern.trim())).filter(Boolean)
    ];

    if (patterns.length === 0) {
        return undefined;
    }
    if (patterns.length === 1) {
        return patterns[0];
    }

    return `{${patterns.join(',')}}`;
}

function hasGlobSyntax(value: string): boolean {
    return /[*?{}]/.test(value);
}

function escapeFindFilesLiteral(value: string): string {
    return value.replace(/[\[\]]/g, character => (character === '[' ? '[[]' : '[]]'));
}
