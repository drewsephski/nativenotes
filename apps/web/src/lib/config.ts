/**
 * Browser-facing API origin for Better Auth + notes.
 *
 * Local: Node backend on :3000 (cross-origin CORS allowed for :3001).
 * Production: same public origin (https://nativenotes.app) via Next rewrites.
 *
 * Never point NEXT_PUBLIC_* at the private backend Vercel hostname in
 * production — cookies and OAuth must stay on the public domain.
 */
export function getNativeNotesApiUrl(): string {
  if (process.env.NODE_ENV === "production") {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    const webOrigin = process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim();
    if (webOrigin) return webOrigin.replace(/\/$/, "");
    return "https://nativenotes.app";
  }

  const configured = process.env.NEXT_PUBLIC_NATIVE_NOTES_API_URL?.trim();
  return configured?.replace(/\/$/, "") || "http://localhost:3000";
}

/**
 * Web app origin for building return URLs to the Next.js shell.
 * Prefer the browser origin at runtime; this is a SSR/dev fallback.
 */
export function getWebOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const configured = process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    return "https://nativenotes.app";
  }
  return "http://localhost:3001";
}

/** Absolute URL to the sign-in page, returning to `/app` by default. */
export function getSignInUrl(returnPath = "/app"): string {
  const api = getNativeNotesApiUrl();
  const returnUrl = new URL(returnPath, getWebOrigin()).toString();
  const signIn = new URL("/sign-in", api);
  signIn.searchParams.set("callbackURL", returnUrl);
  return signIn.toString();
}
