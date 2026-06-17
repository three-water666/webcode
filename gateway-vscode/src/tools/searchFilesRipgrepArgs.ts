import { createRipgrepGitMetadataExcludeGlobs } from './searchCodeUtils';

export function createRipgrepFilesArgs(): string[] {
    const args = [
        '--files',
        '--hidden',
        '--no-messages',
        '--sort',
        'path'
    ];

    for (const pattern of createRipgrepGitMetadataExcludeGlobs()) {
        args.push('--glob', `!${pattern}`);
    }

    return args;
}
