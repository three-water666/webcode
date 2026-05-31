import * as assert from 'assert';

import {
    getBuiltinAiSites,
    getDefaultSelectors,
    getPlatformIdByAddress,
} from '../platforms';

suite('Built-in AI platforms', () => {
    test('includes Qwen as a quick launch site', () => {
        const qwen = getBuiltinAiSites().find(site => site.name === 'Qwen');

        assert.ok(qwen);
        assert.strictEqual(qwen.address, 'https://chat.qwen.ai/');
        assert.strictEqual(qwen.showQuickLaunch, true);
    });

    test('detects Qwen URLs for selector syncing', () => {
        assert.strictEqual(getPlatformIdByAddress('https://chat.qwen.ai/'), 'qwen');
        assert.strictEqual(getPlatformIdByAddress('https://qwen.ai/qwenchat'), 'qwen');
    });

    test('provides Qwen default selectors', () => {
        const selectors = getDefaultSelectors();
        const qwenSelectors = selectors.qwen;

        assert.ok(qwenSelectors);
        assert.strictEqual(qwenSelectors.messageBlocks, '.qwen-chat-message-assistant');
        assert.strictEqual(qwenSelectors.inputArea, 'textarea.message-input-textarea');
        assert.ok(qwenSelectors.codeBlocks.includes('.qwen-markdown-code-body'));
        assert.ok(qwenSelectors.sendButton.includes('.send-button'));
        assert.strictEqual(qwenSelectors.stopButton, '.chat-prompt-send-button .stop-button');
    });
});
