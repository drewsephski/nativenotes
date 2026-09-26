/**
 * Backend origin for the existing NativeNotes Node server (Better Auth).
 * Do not hardcode production URLs in components — set via env.
 */
export function getNativeNotesApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_NATIVE_NOTES_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
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
  return "http://localhost:3001";
}

/** Absolute URL to the existing backend sign-in page, returning to `/app`. */
export function getSignInUrl(returnPath = "/app"): string {
  const api = getNativeNotesApiUrl();
  const returnUrl = new URL(returnPath, getWebOrigin()).toString();
  const signIn = new URL("/sign-in", api);
  signIn.searchParams.set("callbackURL", returnUrl);
  return signIn.toString();
}
