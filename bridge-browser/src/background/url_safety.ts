import { type Session } from '../types';

export function isBridgePageUrl(url: string): boolean {
  return url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:');
}

export async function checkUrlSafety(
  url: string,
  session: Session | undefined,
  isBridgePage: boolean
): Promise<boolean> {
  if (isBridgePage) {return true;}

  const currentOrigin = getOrigin(url);
  if (currentOrigin && session?.allowedOrigins?.includes(currentOrigin)) {
    return true;
  }

  // Check against dynamic sites configuration
  const localItems = await chrome.storage.local.get(["syncedAiSites"]);
  const sites = localItems.syncedAiSites ?? [];

  // Allow if the URL starts with any configured address or fallback address
  const baseUrl = getBaseUrl(url);
  const inDynamic = sites.some((site: any) => baseUrl.startsWith(site.address));

  return inDynamic;
}

// Helper to extract the core domain/URL path without query parameters or hash
function getBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Special handling for legacy matching behavior (e.g. ignoring trailing slashes)
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url;
  }
}

function getOrigin(url: string | undefined): string | null {
  if (!url) {return null;}
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
