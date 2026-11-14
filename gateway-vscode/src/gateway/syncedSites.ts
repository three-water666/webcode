import type { ResolvedAiSiteConfig } from '../platforms';
import { normalizeAutoSendDelaySeconds } from '@webcode/shared';

export interface SyncedAiSiteConfig {
    autoSendDelaySeconds: number;
    capture?: ResolvedAiSiteConfig['capture'];
    id: string;
    name: string;
    selectors: ResolvedAiSiteConfig['selectors'];
}

export function buildSyncedAiSites(aiSites: readonly ResolvedAiSiteConfig[]): SyncedAiSiteConfig[] {
    return aiSites.map(site => ({
        ...(site.capture ? {
            capture: { ...site.capture, channels: [...site.capture.channels] }
        } : {}),
        id: site.id,
        name: site.name,
        autoSendDelaySeconds: normalizeAutoSendDelaySeconds(site.autoSendDelaySeconds),
        selectors: site.selectors
    }));
}
