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
            const relativePath = path.join('new-folder', 'nested', 'deep', 'sample.txt');
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

    test('creates missing child directories under an existing parent', async () => {
        await withTempWorkspace(async workspaceRoot => {
            await fs.mkdir(path.join(workspaceRoot, 'existing-dir'));
            const relativePath = path.join('existing-dir', 'new-subdir', 'sample.txt');

            await writeFileTool.execute(
                {
                    path: relativePath,
                    content: 'partial\n'
                },
                { workspaceRoot } as ToolExecutionContext
            );

            assert.strictEqual(
                await fs.readFile(path.join(workspaceRoot, relativePath), 'utf8'),
                'partial\n'
            );
        });
    });

    test('overwrites an existing file', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const relativePath = 'sample.txt';
            const targetPath = path.join(workspaceRoot, relativePath);
            await fs.writeFile(targetPath, 'old\n', 'utf8');

            await writeFileTool.execute(
                {
                    path: relativePath,
                    content: 'new\n'
                },
                { workspaceRoot } as ToolExecutionContext
            );

            assert.strictEqual(await fs.readFile(targetPath, 'utf8'), 'new\n');
        });
    });

    test('rejects creating parent directories outside the workspace through traversal', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const result = writeFileTool.execute(
                {
                    path: path.join('..', 'outside', 'sample.txt'),
                    content: 'nope\n'
                },
                { workspaceRoot } as ToolExecutionContext
            );

            await assert.rejects(
                result,
                /Access denied/
            );
        });
    });

    test('rejects absolute paths outside the workspace', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-file-tool-absolute-outside-'));
            const outsideFile = path.join(outsideDir, 'sample.txt');
            try {
                const result = writeFileTool.execute(
                    {
                        path: outsideFile,
                        content: 'nope\n'
                    },
                    { workspaceRoot } as ToolExecutionContext
                );

                await assert.rejects(
                    result,
                    /Access denied/
                );
                await assert.rejects(
                    fs.stat(outsideFile),
                    /ENOENT/
                );
            } finally {
                await fs.rm(outsideDir, { recursive: true, force: true });
            }
        });
    });

    test('rejects creating parent directories through a linked outside ancestor', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-file-tool-outside-'));
            try {
                const linkPath = path.join(workspaceRoot, 'outside-link');
                const createdLink = await tryCreateDirectoryLink(outsideDir, linkPath);
                if (!createdLink) {
                    return;
                }

                const result = writeFileTool.execute(
                    {
                        path: path.join('outside-link', 'nested', 'sample.txt'),
                        content: 'nope\n'
                    },
                    { workspaceRoot } as ToolExecutionContext
                );

                await assert.rejects(
                    result,
                    /Access denied/
                );
                await assert.rejects(
                    fs.stat(path.join(outsideDir, 'nested')),
                    /ENOENT/
                );
            } finally {
                await fs.rm(outsideDir, { recursive: true, force: true });
            }
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

async function tryCreateDirectoryLink(targetPath: string, linkPath: string): Promise<boolean> {
    try {
        await fs.symlink(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
        return true;
    } catch (error: unknown) {
        if (hasErrorCode(error, 'EACCES') || hasErrorCode(error, 'EPERM')) {
            return false;
        }
        throw error;
    }
}

function hasErrorCode(error: unknown, code: string): boolean {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === code;
}
