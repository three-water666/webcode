import type { SearchCodeOptions } from './searchCodeTypes';
import {
    createRipgrepExcludeGlobs,
    normalizeIncludeGlob
} from './searchCodeUtils';

export function createSearchCodeRipgrepArgs(options: SearchCodeOptions): string[] {
    const args = [
        '--json',
        '--line-number',
        '--color',
        'never',
        '--no-messages',
        '--hidden',
        '--sort',
        'path'
    ];

    if (!options.caseSensitive) {
        args.push('--ignore-case');
    }
    if (!options.useRegex) {
        args.push('--fixed-strings');
    }

    const includePattern = normalizeIncludeGlob(options.includePattern);
    if (includePattern) {
        args.push('--glob', includePattern);
    }

    for (const pattern of createRipgrepExcludeGlobs(options.excludePatterns)) {
        args.push('--glob', `!${pattern}`);
    }

    args.push('--regexp', options.query, '.');
    return args;
}
