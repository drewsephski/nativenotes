import { env } from "../config/env.js";

/**
 * Strip platform/noise query params so they never become MCP oauth_query state.
 * Vercel share/protection params were previously forwarded into Google sign-in
 * and incorrectly triggered the "connect an MCP client" banner.
 */
export function sanitizeOAuthQuery(raw: string): string {
  if (!raw.trim()) return "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  params.delete("callbackURL");
  for (const key of [...params.keys()]) {
    if (key.startsWith("_vercel")) params.delete(key);
  }
  return params.toString();
}

/**
 * Only browser-redirect to external IdP URLs (e.g. Google).
 * Same-site Locations (apex→www 308, relative /api/auth/…) must never be
 * forwarded to the browser — that produced GET /api/auth/sign-in/social 404.
 */
export function isExternalAuthRedirect(
  location: string,
  baseURL = env.BETTER_AUTH_URL,
): boolean {
  try {
    const target = new URL(location, baseURL);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return false;
    }
    const configuredHost = new URL(baseURL).hostname.toLowerCase();
    const targetHost = target.hostname.toLowerCase();
    if (targetHost === configuredHost) return false;

    const stripWww = (host: string) =>
      host.startsWith("www.") ? host.slice(4) : host;
    if (stripWww(targetHost) === stripWww(configuredHost)) return false;

    // Preview / project aliases on the same Vercel app.
    if (
      targetHost.endsWith(".vercel.app") &&
      (configuredHost.endsWith(".vercel.app") ||
        configuredHost.endsWith("nativenotes.app"))
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
