import type { SearchCodeOptions } from './searchCodeTypes';
import { looksLikeRegexQuery } from './searchCodeUtils';
import { formatSearchResultsLimitedNotice } from './searchResultLimits';

export type SearchCodeResult = {
    matches: string[];
    limited: boolean;
    notices?: string[];
};

export function formatSearchCodeOutput(result: SearchCodeResult, options: SearchCodeOptions): string {
    const lines = [...(result.notices ?? [])];
    if (result.matches.length === 0) {
        lines.push(...createNoMatchesOutput(options).split('\n'));
        return lines.join('\n');
    }

    lines.push(...result.matches);
    if (result.limited) {
        lines.push(formatSearchResultsLimitedNotice(
            'search_code',
            options.maxResults,
            'match(es)',
            'Narrow query/path/include or raise max_results.'
        ));
    }

    return lines.join('\n');
}

function createNoMatchesOutput(options: SearchCodeOptions): string {
    const lines = ['No matches found.'];
    if (!options.useRegex && looksLikeRegexQuery(options.query)) {
        lines.push('Hint: query looks like a regular expression. Did you mean to set match: "regex"?');
    }

    return lines.join('\n');
}
