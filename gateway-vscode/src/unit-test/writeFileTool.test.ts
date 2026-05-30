import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { ToolExecutionContext } from '../tools/types';
import { writeFileTool } from '../tools/writeFileTool';

suite('Write File Tool', () => {
    test('describes automatic parent directory creation', () => {
        assert.match(
            writeFileTool.definition.description,
            /Parent directories are created automatically/
        );
    });

    test('creates missing parent directories before writing a file', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const relativePath = path.join('new-folder', 'nested', 'sample.txt');
            const targetPath = path.join(workspaceRoot, relativePath);

            await writeFileTool.execute(
                {
                    path: relativePath,
                    content: 'hello\n'
                },
                { workspaceRoot } as ToolExecutionContext
            );

            assert.strictEqual(await fs.readFile(targetPath, 'utf8'), 'hello\n');
        });
    });
});

async function withTempWorkspace<T>(callback: (workspaceRoot: string) => Promise<T>): Promise<T> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-file-tool-workspace-'));
    try {
        return await callback(tempDir);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}
