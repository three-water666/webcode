import type { ResolvedAiSiteConfig } from '../platforms';

export interface SyncedAiSiteConfig {
    id: string;
    name: string;
    selectors: ResolvedAiSiteConfig['selectors'];
}

export function buildSyncedAiSites(aiSites: readonly ResolvedAiSiteConfig[]): SyncedAiSiteConfig[] {
    return aiSites.map(site => ({
        id: site.id,
        name: site.name,
        selectors: site.selectors
    }));
}
