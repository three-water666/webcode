import * as assert from 'assert';
import { matchesFileQuery, resolveFileQueryMatchMode } from '../tools/filesystemUtils';
import { createRipgrepFilesArgs } from '../tools/searchFilesRipgrepArgs';

suite('Search Files Tool', () => {
    test('matches plain file queries against file paths and names', () => {
        assert.strictEqual(matchesFileQuery('src/tools/searchFilesTool.ts', 'searchFilesTool.ts', 'tools/searchFiles'), true);
        assert.strictEqual(matchesFileQuery('src/tools/searchFilesTool.ts', 'searchFilesTool.ts', 'searchFilesTool.ts'), true);
    });

    test('treats bracketed filenames as literal file queries', () => {
        assert.strictEqual(matchesFileQuery('app/[id].tsx', '[id].tsx', '[id].tsx'), true);
        assert.strictEqual(matchesFileQuery('app/[id]/page.tsx', 'page.tsx', '[id]'), true);
    });

    test('matches plain file queries case-insensitively by default', () => {
        assert.strictEqual(
            matchesFileQuery('src/WebFetchTool/index.ts', 'index.ts', 'webfetch'),
            true
        );
    });

    test('can match plain file queries case-sensitively', () => {
        assert.strictEqual(
            matchesFileQuery('src/WebFetchTool/index.ts', 'index.ts', 'webfetch', { caseSensitive: true }),
            false
        );
        assert.strictEqual(
            matchesFileQuery('src/WebFetchTool/index.ts', 'index.ts', 'WebFetch', { caseSensitive: true }),
            true
        );
    });

    test('uses star as the list-all query', () => {
        assert.strictEqual(matchesFileQuery('src/sample.ts', 'sample.ts', '*'), true);
        assert.strictEqual(resolveFileQueryMatchMode('*', 'auto'), 'glob');
    });

    test('treats dot as a literal substring query', () => {
        assert.strictEqual(matchesFileQuery('src/sample.ts', 'sample.ts', '.'), true);
        assert.strictEqual(matchesFileQuery('src/LICENSE', 'LICENSE', '.'), false);
        assert.strictEqual(resolveFileQueryMatchMode('.', 'auto'), 'substring');
    });

    test('treats pipe as a literal substring query', () => {
        assert.strictEqual(matchesFileQuery('src/foo.ts', 'foo.ts', 'foo|bar'), false);
        assert.strictEqual(matchesFileQuery('src/foo|bar.ts', 'foo|bar.ts', 'foo|bar'), true);
    });

    test('matches glob brace alternatives in file queries', () => {
        assert.strictEqual(matchesFileQuery('src/App.tsx', 'App.tsx', '*.{ts,tsx}'), true);
        assert.strictEqual(matchesFileQuery('src/App.jsx', 'App.jsx', '*.{ts,tsx}'), false);
        assert.strictEqual(resolveFileQueryMatchMode('*.{ts,tsx}', 'auto'), 'glob');
    });

    test('matches explicit path globs', () => {
        assert.strictEqual(matchesFileQuery('src/tools/searchFilesTool.ts', 'searchFilesTool.ts', 'src/**/*.ts'), true);
        assert.strictEqual(matchesFileQuery('test/tools/searchFilesTool.ts', 'searchFilesTool.ts', 'src/**/*.ts'), false);
    });

    test('allows forcing substring mode for glob-looking queries', () => {
        assert.strictEqual(
            matchesFileQuery('src/*.{ts,tsx}.md', '*.{ts,tsx}.md', '*.{ts,tsx}', { matchMode: 'substring' }),
            true
        );
    });

    test('lists files ignored by gitignore with ripgrep', () => {
        const args = createRipgrepFilesArgs([]);

        assert.ok(args.includes('--no-ignore'));
    });
});
