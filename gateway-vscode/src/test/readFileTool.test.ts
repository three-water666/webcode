import * as fs from 'fs/promises';
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { readFilePrefix, selectReadFileContent, selectReadFileResult } from '../tools/readFileTool';

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

    test('clamps head metadata to the available line count', () => {
        const result = selectReadFileResult(content, { head: 20 });

        assert.strictEqual(result.text, content);
        assert.deepStrictEqual(result.metadata.returnedLines, {
            start: 1,
            end: 4
        });
    });

    test('returns an empty range when start_line is past EOF', () => {
        const result = selectReadFileResult(content, { start_line: 20 });

        assert.strictEqual(result.text, '');
        assert.deepStrictEqual(result.metadata.returnedLines, {
            start: 0,
            end: 0
        });
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

    test('reads prefix until the requested byte count is filled', async () => {
        await withTempFile('abcdef', async filePath => {
            assert.strictEqual(await readFilePrefix(filePath, 5, 2), 'abcde');
        });
    });

    test('preserves utf-8 boundary when byte limit splits a character', async () => {
        await withTempFile('abcd你xyz', async filePath => {
            assert.strictEqual(await readFilePrefix(filePath, 6), 'abcd');
        });
    });

    test('keeps utf-8 character when byte limit ends on a boundary', async () => {
        await withTempFile('abcd你xyz', async filePath => {
            assert.strictEqual(await readFilePrefix(filePath, 7), 'abcd你');
        });
    });
});

async function withTempFile<T>(content: string, callback: (filePath: string) => Promise<T>): Promise<T> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-file-tool-'));
    const filePath = path.join(tempDir, 'sample.txt');
    try {
        await fs.writeFile(filePath, content, 'utf8');
        return await callback(filePath);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}
