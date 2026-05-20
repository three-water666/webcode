import * as assert from 'assert';
import { selectReadFileContent, selectReadFileResult } from '../tools/readFileTool';

suite('Read File Tool', () => {
    const content = ['alpha', 'bravo', 'charlie', 'delta'].join('\n');

    test('reads an inclusive line range with line numbers', () => {
        assert.strictEqual(
            selectReadFileContent(content, {
                start_line: 2,
                end_line: 3,
                show_line_numbers: true
            }),
            ['2: bravo', '3: charlie'].join('\n')
        );
    });

    test('numbers tail output from the original file line', () => {
        assert.strictEqual(
            selectReadFileContent(content, {
                tail: 2,
                show_line_numbers: true
            }),
            ['3: charlie', '4: delta'].join('\n')
        );
    });

    test('rejects mixed head and range selectors', () => {
        assert.throws(
            () => selectReadFileContent(content, { head: 2, start_line: 2 }),
            /Cannot specify head or tail with start_line or end_line/
        );
    });

    test('returns full content for small files without a line selector', () => {
        const result = selectReadFileResult(content, {}, { fileBytes: Buffer.byteLength(content, 'utf8') });

        assert.strictEqual(result.text, content);
        assert.deepStrictEqual(result.metadata, {
            mode: 'full',
            truncated: false,
            lineCount: 4,
            returnedLines: {
                start: 1,
                end: 4
            },
            fileBytes: Buffer.byteLength(content, 'utf8')
        });
    });

    test('truncates large line counts when no selector is provided', () => {
        const largeContent = Array.from({ length: 401 }, (_, index) => `line ${index + 1}`).join('\n');
        const result = selectReadFileResult(largeContent, {}, { fileBytes: Buffer.byteLength(largeContent, 'utf8') });

        assert.ok(result.metadata.truncated);
        assert.strictEqual(result.metadata.returnedLines.end, 400);
        assert.ok(result.text.includes('line 400'));
        assert.ok(!result.text.includes('line 401'));
        assert.ok(result.text.includes('Use start_line/end_line, head, tail, or force: true to read more.'));
    });

    test('force bypasses automatic truncation', () => {
        const largeContent = Array.from({ length: 401 }, (_, index) => `line ${index + 1}`).join('\n');
        const result = selectReadFileResult(largeContent, { force: true }, { fileBytes: Buffer.byteLength(largeContent, 'utf8') });

        assert.strictEqual(result.metadata.mode, 'full');
        assert.strictEqual(result.metadata.truncated, false);
        assert.strictEqual(result.text, largeContent);
    });
});
