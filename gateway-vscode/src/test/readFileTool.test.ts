import * as assert from 'assert';
import { selectReadFileContent } from '../tools/readFileTool';

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
});
