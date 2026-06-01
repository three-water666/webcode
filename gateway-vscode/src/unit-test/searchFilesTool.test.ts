import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { isExistingFile, matchesFileQuery, resolveFileQueryMatchMode } from '../tools/filesystemUtils';
import { createRipgrepFilesArgs } from '../tools/searchFilesRipgrepArgs';
import { formatSearchResultsLimitedNotice } from '../tools/searchResultLimits';

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

    test('respects ignore files with ripgrep', () => {
        const args = createRipgrepFilesArgs([]);

        assert.ok(!args.includes('--no-ignore'));
    });

    test('filters git fallback candidates to existing files', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const filePath = path.join(workspaceRoot, 'sample.ts');
            const directoryPath = path.join(workspaceRoot, 'src');
            const missingPath = path.join(workspaceRoot, 'missing.ts');

            await fs.writeFile(filePath, 'sample\n', 'utf8');
            await fs.mkdir(directoryPath);

            assert.strictEqual(await isExistingFile(filePath), true);
            assert.strictEqual(await isExistingFile(directoryPath), false);
            assert.strictEqual(await isExistingFile(missingPath), false);
        });
    });

    test('formats limited result notices', () => {
        const notice = formatSearchResultsLimitedNotice(
            'search_files',
            200,
            'file(s)',
            'Narrow query/path/exclude_patterns or raise max_results.'
        );

        assert.ok(notice.includes('Results limited to 200 file(s)'));
        assert.ok(notice.includes('There may be more results'));
        assert.ok(notice.includes('Narrow query/path/exclude_patterns'));
    });
});

async function withTempWorkspace(callback: (workspaceRoot: string) => Promise<void>): Promise<void> {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'search-files-tool-'));
    try {
        await callback(workspaceRoot);
    } finally {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
}
