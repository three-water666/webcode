import * as assert from 'assert';
import * as path from 'path';
import { matchesPattern } from '../tools/filesystemUtils';
import { createSearchCodeFallbackNotice } from '../tools/searchCodeFallback';
import {
    getVSCodeAppRootCandidatesFromPath,
    getVSCodeRipgrepCandidates
} from '../tools/searchCodeRipgrepPaths';
import { createSearchCandidate } from '../tools/searchCodeGitFiles';
import { appendRipgrepMatch } from '../tools/searchCodeRipgrepOutput';
import type { SearchCodeOptions } from '../tools/searchCodeTypes';
import {
    createRipgrepExcludeGlobs,
    normalizeIncludeGlob,
    truncateSearchMatchLine
} from '../tools/searchCodeUtils';

suite('Search Code Tool', () => {
    test('treats bare include names as recursive globs', () => {
        assert.strictEqual(normalizeIncludeGlob('package.json'), '**/package.json');
        assert.strictEqual(normalizeIncludeGlob('gateway-vscode/package.json'), 'gateway-vscode/package.json');
    });

    test('matches fallback include globs with brace alternation', () => {
        const includePattern = '**/*.{js,ts,jsx,tsx}';

        assert.ok(matchesPattern('src/modules/logger.ts', includePattern));
        assert.ok(matchesPattern('logger.ts', includePattern));
        assert.ok(matchesPattern('src/App.jsx', includePattern));
        assert.ok(!matchesPattern('src/styles/logger.css', includePattern));
    });

    test('describes fallback search capabilities when ripgrep is unavailable', () => {
        const notice = createSearchCodeFallbackNotice();

        assert.ok(notice.includes('ripgrep is unavailable'));
        assert.ok(notice.includes('in-process fallback'));
        assert.ok(notice.includes('simple comma brace alternation'));
        assert.ok(notice.includes('JavaScript RegExp'));
    });

    test('infers VS Code app roots from PATH bin directories', () => {
        const candidates = getVSCodeAppRootCandidatesFromPath(
            path.join('D:', 'Microsoft VS Code', 'bin'),
            'win32'
        );

        assert.ok(candidates.includes(path.join('D:', 'Microsoft VS Code', 'resources', 'app')));
    });

    test('includes VS Code ripgrep-universal platform arch candidates', () => {
        const appRoot = path.join('D:', 'Microsoft VS Code', 'resources', 'app');
        const candidates = getVSCodeRipgrepCandidates(appRoot, '', 'win32', 'x64');

        assert.ok(candidates.includes(path.join(
            appRoot,
            'node_modules',
            '@vscode',
            'ripgrep-universal',
            'bin',
            'win32-x64',
            'rg.exe'
        )));
    });

    test('excludes common generated and test artifact directories by default', () => {
        const globs = createRipgrepExcludeGlobs([]);

        assert.ok(globs.includes('.vscode-test/**'));
        assert.ok(globs.includes('**/.vscode-test/**'));
        assert.ok(globs.includes('.next/**'));
        assert.ok(globs.includes('target/**'));
    });

    test('crops long matching lines around the match', () => {
        const prefix = 'a'.repeat(120);
        const suffix = 'b'.repeat(120);
        const query = '"version"';
        const line = `${prefix}${query}${suffix}`;
        const result = truncateSearchMatchLine(line, 80, {
            start: prefix.length,
            end: prefix.length + query.length
        });

        assert.ok(result.includes(query));
        assert.ok(result.startsWith('[...'));
        assert.ok(result.endsWith('chars omitted...]'));
        assert.ok(result.length < line.length);
    });

    test('uses ripgrep submatch offsets when cropping regex matches', () => {
        const prefix = '你'.repeat(100);
        const needle = 'needle';
        const line = `${prefix}${needle}${'b'.repeat(100)}`;
        const start = Buffer.byteLength(prefix, 'utf8');
        const message = {
            type: 'match',
            data: {
                path: { text: 'src/sample.txt' },
                lines: { text: `${line}\n` },
                line_number: 7,
                submatches: [{
                    match: { text: needle },
                    start,
                    end: start + Buffer.byteLength(needle, 'utf8')
                }]
            }
        };
        const matches: string[] = [];

        appendRipgrepMatch(JSON.stringify(message), createOptions({
            query: '(?P<word>needle)',
            useRegex: true,
            matchLineMaxChars: 80
        }), matches);

        assert.strictEqual(matches.length, 1);
        assert.ok(matches[0].includes(needle));
        assert.ok(matches[0].includes('chars omitted'));
    });

    test('preserves git ls-files paths with leading or trailing spaces', () => {
        const root = path.resolve('workspace-root');

        assert.strictEqual(
            createSearchCandidate(root, './ leading-space.ts')?.relativeToSearchRoot,
            ' leading-space.ts'
        );
        assert.strictEqual(
            createSearchCandidate(root, 'trailing-space.ts ')?.relativeToSearchRoot,
            'trailing-space.ts '
        );
        assert.strictEqual(createSearchCandidate(root, ''), null);
    });
});

function createOptions(overrides: Partial<SearchCodeOptions> = {}): SearchCodeOptions {
    const root = path.resolve('workspace-root');
    return {
        searchRoot: root,
        workspaceRoot: root,
        query: 'needle',
        maxResults: 100,
        excludePatterns: [],
        caseSensitive: true,
        useRegex: false,
        matchLineMaxChars: 500,
        ...overrides
    };
}
