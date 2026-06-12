import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
    BUILTIN_CREATE_SKILLS_SKILL_FILE_PATH,
    getBuiltinSkillsRoot,
    normalizeBuiltinSkillVirtualPath,
    resolveBuiltinSkillVirtualFile
} from '../builtinSkills';

suite('Built-in skills', () => {
    test('uses the extension skills directory as the built-in skill root', () => {
        assert.strictEqual(
            getBuiltinSkillsRoot(getExtensionPath()),
            path.join(getExtensionPath(), 'skills')
        );
    });

    test('resolves built-in skill virtual files', async () => {
        const result = await resolveBuiltinSkillVirtualFile(getExtensionPath(), BUILTIN_CREATE_SKILLS_SKILL_FILE_PATH);

        assert.strictEqual(result.status, 'found');
        if (result.status !== 'found') {
            assert.fail('Expected built-in skill virtual file to be found.');
        }
        assert.strictEqual(result.path, BUILTIN_CREATE_SKILLS_SKILL_FILE_PATH);
        assert.strictEqual(result.absolutePath, await fs.realpath(path.join(
            getExtensionPath(),
            'skills',
            'create-skills',
            'SKILL.md'
        )));
        assert.ok(result.bytes > 0);
    });

    test('normalizes leading dot slash for built-in virtual paths', () => {
        assert.strictEqual(
            normalizeBuiltinSkillVirtualPath(`./${BUILTIN_CREATE_SKILLS_SKILL_FILE_PATH}`),
            BUILTIN_CREATE_SKILLS_SKILL_FILE_PATH
        );
    });

    test('does not normalize virtual paths that escape the built-in root', async () => {
        const escapingPath = '.webcode/builtin-skills/create-skills/../../package.json';

        assert.strictEqual(normalizeBuiltinSkillVirtualPath(escapingPath), null);
        assert.deepStrictEqual(await resolveBuiltinSkillVirtualFile(getExtensionPath(), escapingPath), {
            status: 'missing',
            path: escapingPath
        });
    });

    test('reports missing files under the built-in skill virtual root', async () => {
        const result = await resolveBuiltinSkillVirtualFile(
            getExtensionPath(),
            '.webcode/builtin-skills/create-skills/missing.md'
        );

        assert.deepStrictEqual(result, {
            status: 'missing',
            path: '.webcode/builtin-skills/create-skills/missing.md'
        });
    });
});

function getExtensionPath(): string {
    return path.resolve(__dirname, '..', '..');
}
