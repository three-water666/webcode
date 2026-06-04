import * as assert from 'assert';

import { getPlatformPromptStorageKey, joinPromptSections, PLATFORM_PROMPT_KEY_PREFIX } from '@webcode/shared';

suite('platform prompt protocol', () => {
    test('builds platform prompt keys from platform id and language', () => {
        assert.strictEqual(
            getPlatformPromptStorageKey('chatgpt', 'zh'),
            `${PLATFORM_PROMPT_KEY_PREFIX}chatgpt_zh`
        );
        assert.strictEqual(
            getPlatformPromptStorageKey('ChatGPT!', 'en'),
            `${PLATFORM_PROMPT_KEY_PREFIX}chatgpt_en`
        );
    });

    test('does not build a prompt key without a platform id', () => {
        assert.strictEqual(getPlatformPromptStorageKey(null, 'zh'), null);
        assert.strictEqual(getPlatformPromptStorageKey('', 'en'), null);
    });

    test('joins optional prompt sections without empty placeholders', () => {
        assert.strictEqual(joinPromptSections(' public ', ' platform '), 'public\n\nplatform');
        assert.strictEqual(joinPromptSections('public', null, undefined, ''), 'public');
    });
});
