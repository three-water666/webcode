import * as assert from 'assert';
import { createFileSearchIncludePattern } from '../tools/searchFilesPatterns';
import { matchesFileQuery } from '../tools/filesystemUtils';

suite('Search Files Tool', () => {
    test('narrows plain path queries before result limits', () => {
        assert.strictEqual(
            createFileSearchIncludePattern('gateway-vscode/src/tools/searchFilesTool.ts'),
            '{**/*gateway-vscode/src/tools/searchFilesTool.ts*,**/*gateway-vscode/src/tools/searchFilesTool.ts*/**}'
        );
    });

    test('keeps filename substring queries focused on matching names', () => {
        assert.strictEqual(createFileSearchIncludePattern('searchFilesTool.ts'), '**/*searchFilesTool.ts*');
    });

    test('escapes bracketed filenames in literal include patterns', () => {
        assert.strictEqual(createFileSearchIncludePattern('[id].tsx'), '**/*[[]id[]].tsx*');
        assert.strictEqual(
            createFileSearchIncludePattern('app/[id]/page.tsx'),
            '{**/*app/[[]id[]]/page.tsx*,**/*app/[[]id[]]/page.tsx*/**}'
        );
    });

    test('treats bracketed filenames as literal file queries', () => {
        assert.strictEqual(matchesFileQuery('app/[id].tsx', '[id].tsx', '[id].tsx'), true);
        assert.strictEqual(matchesFileQuery('app/[id]/page.tsx', 'page.tsx', '[id]'), true);
    });

    test('preserves explicit glob path queries', () => {
        assert.strictEqual(createFileSearchIncludePattern('src/**/*.ts'), 'src/**/*.ts');
    });
});
