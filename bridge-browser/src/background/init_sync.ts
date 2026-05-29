import { BRANDING, PROTOCOL } from '@webcode/shared';

import { getSyncedAiSites, isRecord } from '../types';

export async function fetchInitDataFromGateway(port: number, token: string) {
  try {
    console.log(`${BRANDING.logPrefix} Fetching initialization data from Gateway...`);
    const resp = await fetch(`http://127.0.0.1:${port}/v1/init`, {
      headers: { [PROTOCOL.authHeaderName]: token },
    });
    if (!resp.ok) {
        console.warn(`${BRANDING.logPrefix} Gateway did not respond to /v1/init (might be an older version)`);
        return;
    }
    const data: unknown = await resp.json();

    if (isRecord(data) && isRecord(data.prompts)) {
      console.log(`${BRANDING.logPrefix} Overwriting local rules with Gateway Defaults.`);

      await chrome.storage.local.set({
        syncedAiSites: getSyncedAiSites(data.syncedAiSites), // Save dynamically injected AI sites & selectors
        ...data.prompts // prompt_en, prompt_zh, train_en... etc.
      });
    }
  } catch (e) {
    console.error(`${BRANDING.logPrefix} Initialization sync failed:`, e);
  }
}
