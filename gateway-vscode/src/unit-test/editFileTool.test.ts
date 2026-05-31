import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { createUnifiedDiff } from '../tools/filesystemUtils';
import { editFileTool } from '../tools/editFileTool';
import type { ToolExecutionContext, ToolResult } from '../tools/types';

suite('Edit File Tool', () => {
    test('preserves dollar replacement tokens as literal text', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const relativePath = 'sample.txt';
            const targetPath = path.join(workspaceRoot, relativePath);
            await fs.writeFile(targetPath, 'old\n', 'utf8');

            await editFileTool.execute(
                {
                    path: relativePath,
                    edits: [{ oldText: 'old\n', newText: 'literal $& and $$\n' }]
                },
                { workspaceRoot } as ToolExecutionContext
            );

            assert.strictEqual(await fs.readFile(targetPath, 'utf8'), 'literal $& and $$\n');
        });
    });

    test('explains how to recover from a patch without hunks', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const relativePath = 'sample.txt';
            await fs.writeFile(path.join(workspaceRoot, relativePath), 'old\n', 'utf8');

            await assert.rejects(
                editFileTool.execute(
                    {
                        path: relativePath,
                        patch: '--- sample.txt\n+++ sample.txt\n-old\n+new\n'
                    },
                    { workspaceRoot } as ToolExecutionContext
                ),
                /Use edits for exact text replacements/
            );
        });
    });

    test('truncates very large generated diffs', () => {
        const originalContent = 'start\n' + 'a'.repeat(30000) + '\nend\n';
        const newContent = 'start\n' + 'b'.repeat(30000) + '\nend\n';
        const diff = createUnifiedDiff(originalContent, newContent, 'sample.txt', 1000);

        assert.ok(diff.includes('diff output truncated'));
        assert.ok(diff.length <= 1000);
        assert.ok(diff.endsWith('\n```'));
    });

    test('returns truncated dry-run diffs without writing the file', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const relativePath = 'sample.txt';
            const targetPath = path.join(workspaceRoot, relativePath);
            const originalContent = 'start\n' + 'a'.repeat(30000) + '\nend\n';
            await fs.writeFile(targetPath, originalContent, 'utf8');

            const result = await editFileTool.execute(
                {
                    path: relativePath,
                    edits: [{ oldText: 'a'.repeat(30000), newText: 'b'.repeat(30000) }],
                    dryRun: true
                },
                { workspaceRoot } as ToolExecutionContext
            );

            assert.ok(getResultText(result).includes('diff output truncated'));
            assert.strictEqual(await fs.readFile(targetPath, 'utf8'), originalContent);
        });
    });
});

async function withTempWorkspace<T>(callback: (workspaceRoot: string) => Promise<T>): Promise<T> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-file-tool-workspace-'));
    try {
        return await callback(tempDir);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

function getResultText(result: ToolResult): string {
    return result.content
        .map(item => typeof item.text === 'string' ? item.text : '')
        .join('\n');
}
