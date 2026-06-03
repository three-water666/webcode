import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { buildProjectContextForPrompt } from '../tools/getProjectContextTool';

suite('Project Context Tool', () => {
    test('formats workspace name and shallow structure without absolute paths or expanding generated folders', async () => {
        await withTempWorkspace(async workspaceRoot => {
            await fs.mkdir(path.join(workspaceRoot, '.git'));
            await fs.mkdir(path.join(workspaceRoot, 'node_modules'));
            await fs.writeFile(path.join(workspaceRoot, 'node_modules', 'package.json'), '{}\n', 'utf8');
            await fs.mkdir(path.join(workspaceRoot, 'src'));
            await fs.mkdir(path.join(workspaceRoot, 'docs'));
            await fs.writeFile(path.join(workspaceRoot, 'src', 'index.ts'), 'export {};\n', 'utf8');
            await fs.writeFile(path.join(workspaceRoot, 'docs', 'guide.md'), '# Guide\n', 'utf8');
            await fs.writeFile(path.join(workspaceRoot, 'package.json'), '{}\n', 'utf8');

            const output = await buildProjectContextForPrompt(workspaceRoot);

            assert.ok(output.includes(`# Project Context`));
            assert.ok(output.includes(`- Current project folder: ${path.basename(workspaceRoot)}`));
            assert.ok(output.includes('- Git repository: no'));
            assert.ok(!output.includes('- Git branch:'));
            assert.ok(output.includes('src/'));
            assert.ok(output.includes('src/index.ts'));
            assert.ok(output.includes('docs/guide.md'));
            assert.ok(output.includes('.git/'));
            assert.ok(output.includes('node_modules/'));
            assert.ok(!output.includes(workspaceRoot));
            assert.ok(!output.includes('node_modules/package.json'));
        });
    });

    test('detects Git metadata fallback without expanding the Git directory', async () => {
        await withTempWorkspace(async workspaceRoot => {
            await fs.mkdir(path.join(workspaceRoot, '.git'));
            await fs.writeFile(path.join(workspaceRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
            await fs.writeFile(path.join(workspaceRoot, 'README.md'), '# Sample\n', 'utf8');

            const output = await buildProjectContextForPrompt(workspaceRoot);

            assert.ok(output.includes('- Git repository: yes'));
            assert.ok(output.includes('- Git branch: main'));
            assert.ok(output.includes('## Recent Git Commits'));
            assert.ok(output.includes('.git/'));
            assert.ok(!output.includes('.git/HEAD'));
        });
    });

    test('limits large shallow structures and reports the cap', async () => {
        await withTempWorkspace(async workspaceRoot => {
            for (let index = 0; index < 40; index += 1) {
                const directoryPath = path.join(workspaceRoot, `pkg-${index.toString().padStart(2, '0')}`);
                await fs.mkdir(directoryPath);
                await fs.writeFile(path.join(directoryPath, 'a.ts'), 'export {};\n', 'utf8');
                await fs.writeFile(path.join(directoryPath, 'b.ts'), 'export {};\n', 'utf8');
                await fs.writeFile(path.join(directoryPath, 'c.ts'), 'export {};\n', 'utf8');
            }

            const output = await buildProjectContextForPrompt(workspaceRoot);
            const treeLines = output.split(/\r?\n/).filter(isTreeEntryLine);

            assert.ok(output.includes('up to 100 entries'));
            assert.ok(output.includes('additional entries omitted'));
            assert.ok(treeLines.length <= 100);
        });
    });
});

async function withTempWorkspace(callback: (workspaceRoot: string) => Promise<void>): Promise<void> {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'project-context-tool-'));
    try {
        await callback(workspaceRoot);
    } finally {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
}

function isTreeEntryLine(line: string): boolean {
    return /^\s+/.test(line) && !line.includes('omitted');
}
