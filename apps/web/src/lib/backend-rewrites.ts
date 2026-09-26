/**
 * External rewrite map from the public Next.js surface to the Node backend.
 * Used by next.config.ts and unit tests. Keep path list explicit — no catch-all.
 */

export type BackendRewrite = {
  source: string;
  destination: string;
};

const BACKEND_REWRITE_SOURCES = [
  "/api/auth/:path*",
  "/api/notes",
  "/api/notes/:path*",
  "/.well-known/:path*",
  "/mcp",
  "/oauth/consent",
  "/sign-in",
  "/sign-up",
  "/sign-in/google",
  "/health",
] as const;

/**
 * Validate the server-only rewrite origin.
 * Must be absolute https (or http loopback for local experiments).
 * Must never be the public app host (avoids rewrite loops).
 */
export function validateBackendOrigin(
  raw: string | undefined,
  options?: { requireProductionHttps?: boolean; publicHostnames?: string[] },
): string {
  const value = raw?.trim();
  if (!value) {
    throw new Error("NATIVE_NOTES_BACKEND_ORIGIN is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "NATIVE_NOTES_BACKEND_ORIGIN must be an absolute URL (e.g. https://nativenotes.vercel.app)",
    );
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(
      "NATIVE_NOTES_BACKEND_ORIGIN must be an origin only (no path, query, or fragment)",
    );
  }

  const requireHttps = options?.requireProductionHttps ?? false;
  const isLoopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";

  if (requireHttps && parsed.protocol !== "https:") {
    throw new Error(
      "NATIVE_NOTES_BACKEND_ORIGIN must be https:// in production",
    );
  }
  if (!requireHttps && parsed.protocol !== "https:" && !isLoopback) {
    throw new Error(
      "NATIVE_NOTES_BACKEND_ORIGIN must use https:// (http only on loopback)",
    );
  }

  const publicHostnames = (
    options?.publicHostnames ?? ["nativenotes.app", "www.nativenotes.app"]
  ).map((h) => h.toLowerCase());

  if (publicHostnames.includes(parsed.hostname.toLowerCase())) {
    throw new Error(
      "NATIVE_NOTES_BACKEND_ORIGIN must not point at the public app domain (rewrite loop)",
    );
  }

  return parsed.origin;
}

/** Build explicit Next.js external rewrites for backend-owned paths. */
export function buildBackendRewrites(backendOrigin: string): BackendRewrite[] {
  const origin = backendOrigin.replace(/\/$/, "");
  return BACKEND_REWRITE_SOURCES.map((source) => ({
    source,
    destination: `${origin}${source}`,
  }));
}

export { BACKEND_REWRITE_SOURCES };
