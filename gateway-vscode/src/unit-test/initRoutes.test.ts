import * as assert from 'assert';

import { buildSyncedAiSites } from '../gateway/syncedSites';
import type { ResolvedAiSiteConfig } from '../platforms';

suite('gateway init route helpers', () => {
    test('syncs only browser runtime site fields', () => {
        const syncedSites = buildSyncedAiSites([
            {
                id: 'chatgpt',
                name: 'ChatGPT',
                address: 'https://chatgpt.com',
                showQuickLaunch: true,
                browser: 'isolated-edge',
                selectors: {
                    messageBlocks: '.message',
                    codeBlocks: 'pre code',
                    inputArea: 'textarea',
                    sendButton: 'button.send',
                    stopButton: 'button.stop',
                }
            }
        ] satisfies ResolvedAiSiteConfig[]);

        assert.deepStrictEqual(Object.keys(syncedSites[0]).sort(), ['id', 'name', 'selectors']);
        assert.strictEqual(syncedSites[0].id, 'chatgpt');
        assert.strictEqual(syncedSites[0].name, 'ChatGPT');
    });
});
