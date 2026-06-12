import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';

import {
    BUILTIN_CREATE_SKILLS_SKILL_FILE_PATH,
    BUILTIN_SKILL_VIRTUAL_ROOT
} from '../builtinSkills';
import { SkillManager, type SkillSummary } from '../skillManager';

suite('Skill Manager', () => {
    test('includes built-in skills in listSkills output', async () => {
        await withTempWorkspace(async workspaceRoot => {
            const manager = createSkillManager(workspaceRoot);
            const skills = await manager.listSkills();
            const builtinSkill = requireSkill(skills, 'create-skills');

            assert.strictEqual(builtinSkill.source, 'builtin');
            assert.strictEqual(builtinSkill.relativePath, `${BUILTIN_SKILL_VIRTUAL_ROOT}/create-skills`);
            assert.strictEqual(builtinSkill.sourceDir, BUILTIN_SKILL_VIRTUAL_ROOT);
            assert.strictEqual(builtinSkill.skillFilePath, BUILTIN_CREATE_SKILLS_SKILL_FILE_PATH);
            assert.match(builtinSkill.description, /Create or update workspace skills/);
        });
    });

    test('prefers workspace skills over built-ins with the same name', async () => {
        await withTempWorkspace(async workspaceRoot => {
            await writeWorkspaceSkill(
                workspaceRoot,
                '.agents/skills/create-skills',
                'create-skills',
                'Workspace override for create-skills.'
            );

            const manager = createSkillManager(workspaceRoot);
            const matchingSkills = findSkillsByName(await manager.listSkills(), 'create-skills');

            assert.strictEqual(matchingSkills.length, 1);
            assert.strictEqual(matchingSkills[0].source, 'workspace');
            assert.strictEqual(matchingSkills[0].relativePath, '.agents/skills/create-skills');
            assert.strictEqual(matchingSkills[0].skillFilePath, '.agents/skills/create-skills/SKILL.md');
            assert.strictEqual(matchingSkills[0].description, 'Workspace override for create-skills.');
        });
    });
});

async function withTempWorkspace(callback: (workspaceRoot: string) => Promise<void>): Promise<void> {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-'));
    try {
        await callback(workspaceRoot);
    } finally {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
}

async function writeWorkspaceSkill(
    workspaceRoot: string,
    relativePath: string,
    name: string,
    description: string
): Promise<void> {
    const skillRoot = path.join(workspaceRoot, relativePath);
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, 'SKILL.md'), [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        '---',
        '',
        `# ${name}`,
        ''
    ].join('\n'), 'utf8');
}

function createSkillManager(workspaceRoot: string): SkillManager {
    return new SkillManager(
        createOutputChannel(),
        getExtensionPath(),
        () => [createWorkspaceFolder(workspaceRoot)]
    );
}

function createWorkspaceFolder(workspaceRoot: string): vscode.WorkspaceFolder {
    return {
        uri: { fsPath: workspaceRoot } as vscode.Uri,
        name: path.basename(workspaceRoot),
        index: 0
    };
}

function createOutputChannel(): vscode.OutputChannel {
    return {
        appendLine(value: string) {
            void value;
        }
    } as unknown as vscode.OutputChannel;
}

function requireSkill(skills: SkillSummary[], name: string): SkillSummary {
    const skill = skills.find(item => item.name === name);
    assert.ok(skill);
    return skill;
}

function findSkillsByName(skills: SkillSummary[], name: string): SkillSummary[] {
    return skills.filter(skill => skill.name === name);
}

function getExtensionPath(): string {
    return path.resolve(__dirname, '..', '..');
}
