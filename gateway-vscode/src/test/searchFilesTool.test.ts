import * as assert from 'assert';
import { createFileSearchIncludePattern } from '../tools/searchFilesTool';

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

    test('preserves explicit glob path queries', () => {
        assert.strictEqual(createFileSearchIncludePattern('src/**/*.ts'), 'src/**/*.ts');
    });
});
