import * as assert from 'assert';

import { buildSyncedAiSites } from '../gateway/syncedSites';
import { getConfiguredAiSites, type ResolvedAiSiteConfig } from '../platforms';

suite('gateway init route helpers', () => {
    test('syncs only browser runtime site fields', () => {
        const syncedSites = buildSyncedAiSites([
            {
                id: 'chatgpt',
                name: 'ChatGPT',
                address: 'https://chatgpt.com',
                showQuickLaunch: true,
                browser: 'isolated-edge',
                autoSendDelaySeconds: 12,
                selectors: {
                    messageBlocks: '.message',
                    codeBlocks: 'pre code',
                    inputArea: 'textarea',
                    sendButton: 'button.send',
                    stopButton: 'button.stop',
                }
            }
        ] satisfies ResolvedAiSiteConfig[]);

        assert.deepStrictEqual(Object.keys(syncedSites[0]).sort(), ['autoSendDelaySeconds', 'id', 'name', 'selectors']);
        assert.strictEqual(syncedSites[0].id, 'chatgpt');
        assert.strictEqual(syncedSites[0].name, 'ChatGPT');
        assert.strictEqual(syncedSites[0].autoSendDelaySeconds, 12);
    });

    test('syncs configured network response capture data', () => {
        const syncedSites = buildSyncedAiSites([{
            id: 'chatgpt',
            name: 'ChatGPT',
            address: 'https://chatgpt.com',
            capture: {
                adapter: 'chatgpt-delta-v1',
                channels: ['commentary'],
                enabled: true,
                method: 'POST',
                strategy: 'network-preferred',
                transport: 'fetch-sse',
                url: 'https://chatgpt.com/backend-api/f/conversation'
            },
            selectors: {
                messageBlocks: '.message',
                codeBlocks: 'pre code',
                inputArea: 'textarea',
                sendButton: 'button.send',
                stopButton: 'button.stop',
            }
        }] satisfies ResolvedAiSiteConfig[]);

        assert.strictEqual(syncedSites[0].capture?.adapter, 'chatgpt-delta-v1');
        assert.deepStrictEqual(syncedSites[0].capture?.channels, ['commentary']);
        assert.strictEqual(syncedSites[0].autoSendDelaySeconds, 0);
    });

    test('syncs site-specific delay defaults and VS Code overrides to the browser', () => {
        const sites = buildSyncedAiSites(getConfiguredAiSites([{ id: 'chatgpt', autoSendDelaySeconds: 20 }]));
        assert.strictEqual(sites.find(site => site.id === 'deepseek')?.autoSendDelaySeconds, 10);
        assert.strictEqual(sites.find(site => site.id === 'chatgpt')?.autoSendDelaySeconds, 20);
        assert.strictEqual(sites.find(site => site.id === 'claude')?.autoSendDelaySeconds, 0);
    });
});
