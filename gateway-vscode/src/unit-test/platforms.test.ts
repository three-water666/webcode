import * as assert from 'assert';

import { getPlatformIdByAddress } from '../platforms';

suite('platform registry', () => {
    test('maps ChatGPT hosts to the ChatGPT platform id', () => {
        assert.strictEqual(getPlatformIdByAddress('https://chatgpt.com'), 'chatgpt');
        assert.strictEqual(getPlatformIdByAddress('https://chat.openai.com/'), 'chatgpt');
    });

    test('does not map unrelated OpenAI hosts to ChatGPT', () => {
        assert.strictEqual(getPlatformIdByAddress('https://platform.openai.com'), null);
        assert.strictEqual(getPlatformIdByAddress('https://openai.com/api'), null);
    });

    test('does not map lookalike hostnames by substring', () => {
        assert.strictEqual(getPlatformIdByAddress('https://notchatgpt.com'), null);
        assert.strictEqual(getPlatformIdByAddress('https://chatgpt.com.example.com'), null);
    });
});
