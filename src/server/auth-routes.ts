import type { IncomingMessage, ServerResponse } from "node:http";

import { env } from "../config/env.js";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

function writeHtml(
  response: ServerResponse,
  status: number,
  html: string,
): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`<!doctype html><html><body>${html}</body></html>`);
}

function oauthQueryFromRequest(request: IncomingMessage): string {
  const url = new URL(request.url ?? "/", env.BETTER_AUTH_URL);
  return url.search.startsWith("?") ? url.search.slice(1) : url.search;
}

function pageShell(title: string, body: string): string {
  return `<h1>${escapeHtml(title)}</h1>${body}<p><a href="/sign-in">Sign in</a> · <a href="/sign-up">Sign up</a></p>`;
}

async function forwardAuthJson(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const upstream = await fetch(new URL(path, env.BETTER_AUTH_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(request.headers.cookie
        ? { cookie: Array.isArray(request.headers.cookie)
            ? request.headers.cookie.join("; ")
            : request.headers.cookie }
        : {}),
    },
    body: JSON.stringify(payload),
    redirect: "manual",
  });

  const setCookie = upstream.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) response.setHeader("set-cookie", setCookie);

  const location = upstream.headers.get("location");
  if (location) {
    response.writeHead(303, {
      location,
      "cache-control": "no-store",
    });
    response.end();
    return;
  }

  const text = await upstream.text();
  let redirectUri: string | undefined;
  try {
    const parsed = text
      ? (JSON.parse(text) as { redirect_uri?: unknown })
      : null;
    if (parsed && typeof parsed.redirect_uri === "string") {
      redirectUri = parsed.redirect_uri;
    }
  } catch {
    // Non-JSON success bodies fall through to the default next location.
  }

  if (!upstream.ok) {
    writeHtml(
      response,
      upstream.status >= 400 ? upstream.status : 400,
      pageShell(
        "Authentication failed",
        "<p>Unable to complete authentication. Check your credentials and try again.</p>",
      ),
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
    typeof payload.oauth_query === "string" && payload.oauth_query.length > 0
      ? (() => {
          const authorizeUrl = new URL(
            "/api/auth/oauth2/authorize",
            env.BETTER_AUTH_URL,
          );
          authorizeUrl.search = String(payload.oauth_query);
          return authorizeUrl.toString();
        })()
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

  if (request.method === "GET") {
    writeHtml(
      response,
      200,
      pageShell(
        "NativeNotes sign in",
        `<form method="post"><label>Email <input name="email" type="email" required autocomplete="username"></label><label>Password <input name="password" type="password" required autocomplete="current-password"></label><input type="hidden" name="oauth_query" value="${escapeHtml(oauthQuery)}"><button type="submit">Sign in</button></form>`,
      ),
    );
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "GET, POST" });
    response.end();
    return;
  }

  const body = await readBody(request);
  if (!body.email || !body.password) {
    writeHtml(
      response,
      400,
      pageShell("Sign in failed", "<p>Email and password are required.</p>"),
    );
    return;
  }

  await forwardAuthJson(request, response, "/api/auth/sign-in/email", {
    email: body.email,
    password: body.password,
    ...(body.oauth_query ? { oauth_query: body.oauth_query } : {}),
  });
}

export async function handleSignUpRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const oauthQuery = oauthQueryFromRequest(request);

  if (request.method === "GET") {
    writeHtml(
      response,
      200,
      pageShell(
        "NativeNotes sign up",
        `<form method="post"><label>Name <input name="name" type="text" required autocomplete="name"></label><label>Email <input name="email" type="email" required autocomplete="username"></label><label>Password <input name="password" type="password" required autocomplete="new-password" minlength="8"></label><input type="hidden" name="oauth_query" value="${escapeHtml(oauthQuery)}"><button type="submit">Create account</button></form>`,
      ),
    );
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "GET, POST" });
    response.end();
    return;
  }

  const body = await readBody(request);
  if (!body.name || !body.email || !body.password) {
    writeHtml(
      response,
      400,
      pageShell(
        "Sign up failed",
        "<p>Name, email, and password are required.</p>",
      ),
    );
    return;
  }

  await forwardAuthJson(request, response, "/api/auth/sign-up/email", {
    name: body.name,
    email: body.email,
    password: body.password,
    ...(body.oauth_query ? { oauth_query: body.oauth_query } : {}),
  });
}
