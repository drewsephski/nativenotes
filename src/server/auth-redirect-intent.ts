import { sanitizeOAuthQuery } from "./auth-forward.js";

/** Default post-login destination for the Next.js shell (never `/`). */
export const DEFAULT_POST_LOGIN_PATH = "/app";

/**
 * Restrict callbackURL to trustedOrigins so login never open-redirects.
 */
export function sanitizeTrustedCallbackURL(
  value: string | null | undefined,
  trustedOrigins: readonly string[],
): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  try {
    const parsed = new URL(value);
    if (!trustedOrigins.includes(parsed.origin)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export type PostLoginIntentInput = {
  oauthQuery?: string | null;
  callbackURL?: string | null;
  betterAuthUrl: string;
  trustedOrigins: readonly string[];
};

export type PostLoginIntent =
  | { kind: "oauth"; location: string }
  | { kind: "callback"; location: string }
  | { kind: "default"; location: typeof DEFAULT_POST_LOGIN_PATH };

/**
 * Formalize three login outcomes:
 * A. oauth_query → continue Better Auth OAuth authorize (MCP/ChatGPT)
 * B. trusted callbackURL → that URL (typically https://nativenotes.app/app)
 * C. neither → /app
 *
 * oauth_query always wins over callbackURL.
 */
export function resolvePostLoginIntent(
  input: PostLoginIntentInput,
): PostLoginIntent {
  const oauthQuery = sanitizeOAuthQuery(input.oauthQuery ?? "");
  if (oauthQuery.length > 0) {
    const authorizeUrl = new URL(
      "/api/auth/oauth2/authorize",
      input.betterAuthUrl,
    );
    authorizeUrl.search = oauthQuery;
    return { kind: "oauth", location: authorizeUrl.toString() };
  }

  const trusted = sanitizeTrustedCallbackURL(
    input.callbackURL,
    input.trustedOrigins,
  );
  if (trusted) {
    return { kind: "callback", location: trusted };
  }

  return { kind: "default", location: DEFAULT_POST_LOGIN_PATH };
}

/** Location string for HTTP 303 after email/password (or similar) success. */
export function resolvePostLoginLocation(input: PostLoginIntentInput): string {
  return resolvePostLoginIntent(input).location;
}

/**
 * callbackURL passed into Better Auth social sign-in.
 * Never `/`. When oauth_query is present, Better Auth still continues MCP
 * OAuth via serverContext; this is only the non-OAuth fallback.
 */
export function resolveSocialCallbackURL(input: {
  oauthQuery?: string | null;
  callbackURL?: string | null;
  trustedOrigins: readonly string[];
}): string {
  const oauthQuery = sanitizeOAuthQuery(input.oauthQuery ?? "");
  if (oauthQuery.length > 0) {
    // Prefer continuing OAuth; /app is only a non-OAuth safety net.
    return DEFAULT_POST_LOGIN_PATH;
  }
  return (
    sanitizeTrustedCallbackURL(input.callbackURL, input.trustedOrigins) ??
    DEFAULT_POST_LOGIN_PATH
  );
}
