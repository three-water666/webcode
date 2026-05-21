import type express from 'express';

import { PROMPTS } from '../defaults';
import { getPlatformIdByAddress } from '../platforms';
import type { BuiltinSelectors, GatewayConfig, GatewayLogger } from './types';

export function registerConfigRoutes(
    app: express.Express,
    config: GatewayConfig,
    builtinSelectors: BuiltinSelectors,
    log: GatewayLogger
): void {
    app.get('/v1/init', (req, res) => {
        log('📥 Init Sync: Browser requested default rules and prompts');

        const selectorsByPlatform = builtinSelectors as Record<string, Record<string, unknown>>;
        const syncedAiSites = (config.aiSites ?? []).map(site => {
            const platformId = getPlatformIdByAddress(site.address);
            const defaultSelectors = platformId ? selectorsByPlatform[platformId] ?? {} : {};

            return {
                ...site,
                selectors: { ...defaultSelectors, ...(site.selectors ?? {}) }
            };
        });

        res.json({
            syncedAiSites: syncedAiSites,
            prompts: PROMPTS
        });
    });

    app.get('/v1/config', (req, res) => {
        res.json({ config: null });
    });

    app.post('/v1/config', (req, res) => {
        res.json({ success: true });
    });
}
