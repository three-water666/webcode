import { type Session } from '../types';

export function isBridgePageUrl(url: string, port: number | undefined): boolean {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl || typeof port !== "number") {
    return false;
  }

  return parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost") &&
    parsedUrl.port === String(port) &&
    normalizePath(parsedUrl.pathname) === "/bridge";
}

export function checkUrlSafety(
  url: string,
  session: Session | undefined,
  isBridgePage: boolean
): boolean {
  if (isBridgePage) {return true;}
  if (!session) {return false;}
  if (!session.siteId) {return false;}

  const targetOrigin = session.targetOrigin ?? session.allowedOrigins?.[0];
  const currentOrigin = getOrigin(url);
  if (!targetOrigin || !currentOrigin || currentOrigin !== targetOrigin) {
    return false;
  }

  if (!session.targetUrl) {
    return true;
  }

  return urlBelongsToTarget(url, session.targetUrl);
}

function urlBelongsToTarget(url: string, targetUrl: string): boolean {
  const parsedUrl = parseUrl(url);
  const parsedTarget = parseUrl(targetUrl);
  if (!parsedUrl || !parsedTarget) {
    return false;
  }

  if (parsedUrl.origin !== parsedTarget.origin) {
    return false;
  }

  const targetPath = normalizePath(parsedTarget.pathname);
  if (targetPath === '/') {
    return true;
  }

  const currentPath = normalizePath(parsedUrl.pathname);
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function getOrigin(url: string | undefined): string | null {
  return parseUrl(url)?.origin ?? null;
}

function parseUrl(url: string | undefined): URL | null {
  if (!url) {return null;}
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized === '' ? '/' : normalized;
}
