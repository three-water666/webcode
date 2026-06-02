import { createRipgrepExcludeGlobs } from './searchCodeUtils';

export function createRipgrepFilesArgs(excludePatterns: string[]): string[] {
    const args = [
        '--files',
        '--hidden',
        '--no-messages',
        '--sort',
        'path'
    ];

    for (const pattern of createRipgrepExcludeGlobs(excludePatterns)) {
        args.push('--glob', `!${pattern}`);
    }

    return args;
}
