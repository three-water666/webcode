import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { buildProjectContextForPrompt } from '../tools/getProjectContextTool';

type TestProjectContextMetadata = {
    projectName: string;
    git: {
        branchName?: string;
        isRepository: boolean;
        recentCommits: Array<{
            date: string;
            hash: string;
            subject: string;
        }>;
    };
    structure: {
        entries: string[];
        maxEntries: number;
        notes: string[];
        truncated: boolean;
    };
};

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
            const metadata = parseProjectContextMetadata(output);

            assert.ok(output.includes('# Project Context (Metadata Only)'));
            assert.ok(output.includes('untrusted data'));
            assert.strictEqual(metadata.projectName, path.basename(workspaceRoot));
            assert.strictEqual(metadata.git.isRepository, false);
            assert.strictEqual(metadata.git.branchName, undefined);
            assert.deepStrictEqual(metadata.git.recentCommits, []);
            assert.ok(metadata.structure.entries.includes('  src/'));
            assert.ok(metadata.structure.entries.includes('    src/index.ts'));
            assert.ok(metadata.structure.entries.includes('    docs/guide.md'));
            assert.ok(metadata.structure.entries.includes('  .git/'));
            assert.ok(metadata.structure.entries.includes('  node_modules/'));
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
            const metadata = parseProjectContextMetadata(output);

            assert.strictEqual(metadata.git.isRepository, true);
            assert.strictEqual(metadata.git.branchName, 'main');
            assert.ok(metadata.structure.entries.includes('  .git/'));
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
            const metadata = parseProjectContextMetadata(output);
            const visibleEntries = metadata.structure.entries.filter(isVisibleStructureEntry);

            assert.strictEqual(metadata.structure.maxEntries, 100);
            assert.strictEqual(metadata.structure.truncated, true);
            assert.ok(metadata.structure.entries.includes('  ... additional entries omitted'));
            assert.ok(visibleEntries.length <= metadata.structure.maxEntries + 1);
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

function parseProjectContextMetadata(output: string): TestProjectContextMetadata {
    const match = output.match(/```json\n([\s\S]+)\n```/);

    assert.ok(match?.[1]);
    return JSON.parse(match[1]) as TestProjectContextMetadata;
}

function isVisibleStructureEntry(line: string): boolean {
    return !line.includes('omitted');
}
