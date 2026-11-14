import * as assert from 'assert';

import {
    findAiSiteById,
    getConfiguredAiSites,
    isTargetAllowedForSite,
    type SiteSelectors
} from '../platforms';

suite('platform registry', () => {
    test('returns built-in sites with stable ids and complete selectors', () => {
        const sites = getConfiguredAiSites(undefined);
        const chatgpt = findAiSiteById(sites, 'chatgpt');

        assert.ok(chatgpt);
        assert.strictEqual(chatgpt.name, 'ChatGPT');
        assert.strictEqual(chatgpt.address, 'https://chatgpt.com');
        assert.strictEqual(chatgpt.capture?.adapter, 'chatgpt-delta-v1');
        assert.strictEqual(chatgpt.capture?.url, 'https://chatgpt.com/backend-api/f/conversation');
        assert.strictEqual(typeof chatgpt.selectors.inputArea, 'string');

        const deepseek = findAiSiteById(sites, 'deepseek');
        assert.ok(deepseek);
        assert.strictEqual(deepseek.capture?.adapter, 'deepseek-chat-v0');
        assert.deepStrictEqual(deepseek.capture?.channels, ['response']);
        assert.strictEqual(deepseek.capture?.transport, 'xhr-sse');
        assert.strictEqual(deepseek.capture?.url, 'https://chat.deepseek.com/api/v0/chat/completion');
    });

    test('adds a default send delay only for DeepSeek', () => {
        const sites = getConfiguredAiSites(undefined);
        for (const site of sites) {
            assert.strictEqual(site.autoSendDelaySeconds, site.id === 'deepseek' ? 10 : 0);
        }
    });

    test('overrides each site delay independently and accepts zero', () => {
        const sites = getConfiguredAiSites([
            { id: 'deepseek', autoSendDelaySeconds: 0 },
            { id: 'chatgpt', autoSendDelaySeconds: 30 },
        ]);
        assert.strictEqual(findAiSiteById(sites, 'deepseek')?.autoSendDelaySeconds, 0);
        assert.strictEqual(findAiSiteById(sites, 'chatgpt')?.autoSendDelaySeconds, 30);
        assert.strictEqual(findAiSiteById(sites, 'claude')?.autoSendDelaySeconds, 0);
    });

    test('keeps inherited delays for absent or invalid site overrides', () => {
        for (const value of [undefined, -1, NaN, Infinity, 301]) {
            const sites = getConfiguredAiSites([
                { id: 'deepseek', autoSendDelaySeconds: value },
                { id: 'chatgpt', autoSendDelaySeconds: value },
            ]);
            assert.strictEqual(findAiSiteById(sites, 'deepseek')?.autoSendDelaySeconds, 10);
            assert.strictEqual(findAiSiteById(sites, 'chatgpt')?.autoSendDelaySeconds, 0);
        }
    });

    test('supports delays for custom sites with a zero default', () => {
        const sites = getConfiguredAiSites([
            { id: 'custom-ai', address: 'https://ai.example.test', selectors: createSelectors(), autoSendDelaySeconds: 300 },
            { id: 'another-ai', address: 'https://another.example.test', selectors: createSelectors() },
        ]);
        assert.strictEqual(findAiSiteById(sites, 'custom-ai')?.autoSendDelaySeconds, 300);
        assert.strictEqual(findAiSiteById(sites, 'another-ai')?.autoSendDelaySeconds, 0);
    });

    test('uses Qwen selectors that prefer the first comparison response', () => {
        const sites = getConfiguredAiSites(undefined);
        const qwen = findAiSiteById(sites, 'qwen');

        assert.ok(qwen);
        assert.strictEqual(
            qwen.selectors.messageBlocks,
            '.qwen-chat-message-dual-message .smulti-o-response-message-wrapper > .response-message-box:first-child .chat-response-message-right, .qwen-chat-message-assistant:not(.qwen-chat-message-dual-message) .chat-response-message-right'
        );
    });

    test('merges user overrides by id', () => {
        const sites = getConfiguredAiSites([
            {
                id: 'chatgpt',
                address: 'https://chatgpt.com/g/example',
                showQuickLaunch: false,
                selectors: {
                    inputArea: '#custom-input'
                }
            }
        ]);
        const chatgpt = findAiSiteById(sites, 'chatgpt');

        assert.ok(chatgpt);
        assert.strictEqual(chatgpt.address, 'https://chatgpt.com/g/example');
        assert.strictEqual(chatgpt.showQuickLaunch, false);
        assert.strictEqual(chatgpt.selectors.inputArea, '#custom-input');
        assert.strictEqual(chatgpt.selectors.codeBlocks, 'pre code');
    });

    test('keeps name fallback for old built-in overrides without id', () => {
        const sites = getConfiguredAiSites([
            {
                name: 'ChatGPT',
                selectors: {
                    sendButton: 'button[data-test="send"]'
                }
            }
        ]);
        const chatgpt = findAiSiteById(sites, 'chatgpt');

        assert.ok(chatgpt);
        assert.strictEqual(chatgpt.selectors.sendButton, 'button[data-test="send"]');
    });

    test('merges network capture overrides by id', () => {
        const sites = getConfiguredAiSites([{
            id: 'chatgpt',
            capture: {
                enabled: false
            }
        }]);
        const chatgpt = findAiSiteById(sites, 'chatgpt');

        assert.ok(chatgpt?.capture);
        assert.strictEqual(chatgpt.capture.enabled, false);
        assert.strictEqual(chatgpt.capture.adapter, 'chatgpt-delta-v1');
        assert.deepStrictEqual(chatgpt.capture.channels, ['commentary']);
    });

    test('adds custom sites with a new id and complete selectors', () => {
        const sites = getConfiguredAiSites([
            {
                id: 'custom-ai',
                name: 'Custom AI',
                address: 'https://ai.example.test/chat',
                selectors: createSelectors()
            }
        ]);
        const custom = findAiSiteById(sites, 'custom-ai');

        assert.ok(custom);
        assert.strictEqual(custom.name, 'Custom AI');
        assert.strictEqual(custom.address, 'https://ai.example.test/chat');
        assert.strictEqual(custom.selectors.inputArea, 'textarea');
    });

    test('does not add custom sites without complete selectors', () => {
        const sites = getConfiguredAiSites([
            {
                id: 'broken-ai',
                name: 'Broken AI',
                address: 'https://broken.example.test',
                selectors: {
                    inputArea: 'textarea'
                }
            }
        ]);

        assert.strictEqual(findAiSiteById(sites, 'broken-ai'), null);
    });

    test('checks whether a target belongs to a site address', () => {
        assert.strictEqual(
            isTargetAllowedForSite('https://chatgpt.com/g/example', { address: 'https://chatgpt.com' }),
            true
        );
        assert.strictEqual(
            isTargetAllowedForSite('https://ai.example.test/chat/new', { address: 'https://ai.example.test/chat' }),
            true
        );
        assert.strictEqual(
            isTargetAllowedForSite('https://ai.example.test/other', { address: 'https://ai.example.test/chat' }),
            false
        );
    });
});

function createSelectors(): SiteSelectors {
    return {
        messageBlocks: '.message',
        codeBlocks: 'pre code',
        inputArea: 'textarea',
        sendButton: 'button.send',
        stopButton: 'button.stop',
    };
}
