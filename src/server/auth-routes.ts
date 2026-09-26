import type { IncomingMessage, ServerResponse } from "node:http";

import { auth } from "../auth/auth.js";
import { env, googleOAuthEnabled, trustedOrigins } from "../config/env.js";
import { writeHtml } from "../ui/html.js";
import {
  renderSignInPage,
  renderSignUpPage,
  renderSimpleStatusPage,
} from "../ui/pages.js";
import {
  isExternalAuthRedirect,
  sanitizeOAuthQuery,
} from "./auth-forward.js";
import { trustedForwardOrigin } from "./request-origin.js";

function oauthQueryFromRequest(request: IncomingMessage): string {
  const url = new URL(request.url ?? "/", env.BETTER_AUTH_URL);
  return sanitizeOAuthQuery(url.searchParams.toString());
}

/**
 * Return URL for the Next.js shell (or other trusted frontends).
 * Validated against trustedOrigins so we never open redirects.
 */
function callbackURLFromRequest(request: IncomingMessage): string | undefined {
  const url = new URL(request.url ?? "/", env.BETTER_AUTH_URL);
  return sanitizeCallbackURL(url.searchParams.get("callbackURL"));
}

function sanitizeCallbackURL(value: string | null | undefined): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  try {
    const parsed = new URL(value);
    if (!trustedOrigins.includes(parsed.origin)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

async function forwardAuthJson(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  payload: Record<string, unknown>,
  options?: { mode?: "sign-in" | "sign-up" },
): Promise<void> {
  const mode = options?.mode ?? "sign-in";
  const oauthQuery =
    typeof payload.oauth_query === "string"
      ? sanitizeOAuthQuery(payload.oauth_query)
      : "";
  if (typeof payload.oauth_query === "string") {
    if (oauthQuery) payload.oauth_query = oauthQuery;
    else delete payload.oauth_query;
  }

  // In-process Better Auth call — never HTTP self-fetch.
  // Public fetch(BETTER_AUTH_URL) hits Vercel apex→www 308 and was incorrectly
  // forwarded to the browser as Location: /api/auth/sign-in/social.
  const upstream = await auth.handler(
    new Request(new URL(path, env.BETTER_AUTH_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: trustedForwardOrigin(request),
        ...(request.headers.cookie
          ? {
              cookie: Array.isArray(request.headers.cookie)
                ? request.headers.cookie.join("; ")
                : request.headers.cookie,
            }
          : {}),
      },
      body: JSON.stringify(payload),
      redirect: "manual",
    }),
  );

  const setCookie = upstream.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) response.setHeader("set-cookie", setCookie);

  const location = upstream.headers.get("location");
  if (location && isExternalAuthRedirect(location)) {
    response.writeHead(303, {
      location,
      "cache-control": "no-store",
    });
    response.end();
    return;
  }

  const text = await upstream.text();
  let redirectUri: string | undefined;
  let errorMessage: string | undefined;
  try {
    const parsed = text
      ? (JSON.parse(text) as {
          redirect_uri?: unknown;
          url?: unknown;
          redirect?: unknown;
          message?: unknown;
          error?: unknown;
        })
      : null;
    if (parsed && typeof parsed.redirect_uri === "string") {
      redirectUri = parsed.redirect_uri;
    } else if (
      parsed &&
      parsed.redirect === true &&
      typeof parsed.url === "string"
    ) {
      redirectUri = parsed.url;
    } else if (parsed && typeof parsed.url === "string") {
      redirectUri = parsed.url;
    }
    if (parsed && typeof parsed.message === "string") {
      errorMessage = parsed.message;
    } else if (parsed && typeof parsed.error === "string") {
      errorMessage = parsed.error;
    }
  } catch {
    // Non-JSON success bodies fall through to the default next location.
  }

  if (!upstream.ok) {
    const failureCallbackURL =
      typeof payload.callbackURL === "string" ? payload.callbackURL : undefined;
    const failurePage =
      mode === "sign-up"
        ? renderSignUpPage({
            oauthQuery,
            callbackURL: failureCallbackURL,
            googleEnabled: googleOAuthEnabled,
            message: {
              text:
                errorMessage ??
                "Unable to create the account. Check your details and try again.",
            },
          })
        : renderSignInPage({
            oauthQuery,
            callbackURL: failureCallbackURL,
            googleEnabled: googleOAuthEnabled,
            message: {
              text:
                errorMessage ??
                "Unable to complete authentication. Check your credentials and try again.",
            },
          });
    writeHtml(
      response,
      upstream.status >= 400 ? upstream.status : 400,
      failurePage,
    );
    return;
  }

  if (redirectUri) {
    response.writeHead(303, {
      location: redirectUri,
      "cache-control": "no-store",
    });
    response.end();
    return;
  }

  const next =
    oauthQuery.length > 0
      ? (() => {
          const authorizeUrl = new URL(
            "/api/auth/oauth2/authorize",
            env.BETTER_AUTH_URL,
          );
          authorizeUrl.search = oauthQuery;
          return authorizeUrl.toString();
        })()
      : typeof payload.callbackURL === "string" && payload.callbackURL.length > 0
        ? payload.callbackURL
        : "/";

  response.writeHead(303, {
    location: next,
    "cache-control": "no-store",
  });
  response.end();
}

async function readBody(
  request: IncomingMessage,
): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  return Object.fromEntries(body.entries());
}

export async function handleSignInRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const oauthQuery = oauthQueryFromRequest(request);
  const callbackURL = callbackURLFromRequest(request);

  if (request.method === "GET") {
    writeHtml(
      response,
      200,
      renderSignInPage({
        oauthQuery,
        callbackURL,
        googleEnabled: googleOAuthEnabled,
      }),
    );
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "GET, POST" });
    response.end();
    return;
  }

  const body = await readBody(request);
  const formCallbackURL = sanitizeCallbackURL(body.callbackURL);
  const formOAuthQuery = sanitizeOAuthQuery(body.oauth_query ?? oauthQuery);
  if (!body.email || !body.password) {
    writeHtml(
      response,
      400,
      renderSignInPage({
        oauthQuery: formOAuthQuery,
        callbackURL: formCallbackURL ?? callbackURL,
        googleEnabled: googleOAuthEnabled,
        message: { text: "Email and password are required." },
      }),
    );
    return;
  }

  await forwardAuthJson(request, response, "/api/auth/sign-in/email", {
    email: body.email,
    password: body.password,
    ...(formCallbackURL ? { callbackURL: formCallbackURL } : {}),
    ...(formOAuthQuery ? { oauth_query: formOAuthQuery } : {}),
  });
}

export async function handleSignUpRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const oauthQuery = oauthQueryFromRequest(request);
  const callbackURL = callbackURLFromRequest(request);

  if (request.method === "GET") {
    writeHtml(
      response,
      200,
      renderSignUpPage({
        oauthQuery,
        callbackURL,
        googleEnabled: googleOAuthEnabled,
      }),
    );
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "GET, POST" });
    response.end();
    return;
  }

  const body = await readBody(request);
  const formCallbackURL = sanitizeCallbackURL(body.callbackURL);
  const formOAuthQuery = sanitizeOAuthQuery(body.oauth_query ?? oauthQuery);
  if (!body.name || !body.email || !body.password) {
    writeHtml(
      response,
      400,
      renderSignUpPage({
        oauthQuery: formOAuthQuery,
        callbackURL: formCallbackURL ?? callbackURL,
        googleEnabled: googleOAuthEnabled,
        message: { text: "Name, email, and password are required." },
      }),
    );
    return;
  }

  await forwardAuthJson(
    request,
    response,
    "/api/auth/sign-up/email",
    {
      name: body.name,
      email: body.email,
      password: body.password,
      ...(formCallbackURL ? { callbackURL: formCallbackURL } : {}),
      ...(formOAuthQuery ? { oauth_query: formOAuthQuery } : {}),
    },
    { mode: "sign-up" },
  );
}

/**
 * Starts Better Auth Google social sign-in.
 * Passes `oauth_query` so the OAuth Provider serverContext preserves the
 * ChatGPT authorize state across the Google round trip.
 */
export async function handleGoogleSignInRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST" });
    response.end();
    return;
  }

  if (!googleOAuthEnabled) {
    writeHtml(
      response,
      503,
      renderSimpleStatusPage({
        title: "Google sign-in unavailable",
        message:
          "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        statusTone: "error",
      }),
    );
    return;
  }

  const body = await readBody(request);
  const oauthQuery = sanitizeOAuthQuery(body.oauth_query ?? "");
  const formCallbackURL = sanitizeCallbackURL(body.callbackURL);

  await forwardAuthJson(request, response, "/api/auth/sign-in/social", {
    provider: "google",
    callbackURL: formCallbackURL ?? "/",
    ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
  });
}
