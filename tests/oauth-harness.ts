import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { decodeJwt } from "jose";

import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

export type CookieJar = Map<string, string>;

export const HARNESS_CLIENT_ID = "nativenotes-oauth-harness";
export const HARNESS_REDIRECT_URI = "http://127.0.0.1/oauth/harness/callback";

export function createCookieJar(): CookieJar {
  return new Map();
}

export function storeCookies(jar: CookieJar, response: Response): void {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  for (const raw of cookies) {
    const [pair] = raw.split(";");
    if (!pair) continue;
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

export function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export async function fetchWithCookies(
  jar: CookieJar,
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = cookieHeader(jar);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(input, {
    ...init,
    headers,
    redirect: "manual",
  });
  storeCookies(jar, response);
  return response;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function followRedirects(
  jar: CookieJar,
  startUrl: string,
  maxHops = 12,
): Promise<{ response: Response; url: string }> {
  let url = startUrl;
  let response = await fetchWithCookies(jar, url, {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,application/json" },
  });
  for (let hop = 0; hop < maxHops; hop += 1) {
    if (url.startsWith(HARNESS_REDIRECT_URI)) {
      return { response, url };
    }

    const location = response.headers.get("location");
    if (location) {
      url = new URL(location, url).toString();
      if (url.startsWith(HARNESS_REDIRECT_URI)) {
        return { response, url };
      }
      response = await fetchWithCookies(jar, url, {
        method: "GET",
        headers: { accept: "text/html,application/xhtml+xml,application/json" },
      });
      continue;
    }

    if (response.status >= 200 && response.status < 300) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as {
          redirect?: boolean;
          url?: string;
          redirect_uri?: string;
        } | null;
        const next =
          body && body.redirect === true && typeof body.url === "string"
            ? body.url
            : body && typeof body.redirect_uri === "string"
              ? body.redirect_uri
              : null;
        if (next) {
          url = new URL(next, url).toString();
          if (url.startsWith(HARNESS_REDIRECT_URI)) {
            return { response, url };
          }
          response = await fetchWithCookies(jar, url, {
            method: "GET",
            headers: {
              accept: "text/html,application/xhtml+xml,application/json",
            },
          });
          continue;
        }
      }
      return { response, url };
    }

    return { response, url };
  }
  throw new Error("Too many redirects");
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
};

export function decodeAccessToken(token: string): Record<string, unknown> {
  return decodeJwt(token) as Record<string, unknown>;
}

export async function exchangeAuthorizationCode(input: {
  baseUrl: string;
  code: string;
  verifier: string;
  resource: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: HARNESS_CLIENT_ID,
    code: input.code,
    redirect_uri: HARNESS_REDIRECT_URI,
    code_verifier: input.verifier,
    resource: input.resource,
  });
  const response = await fetch(`${input.baseUrl}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `token exchange failed: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as TokenResponse;
}

export async function refreshAccessToken(input: {
  baseUrl: string;
  refreshToken: string;
  resource: string;
}): Promise<{ status: number; body: TokenResponse | Record<string, unknown> }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: HARNESS_CLIENT_ID,
    refresh_token: input.refreshToken,
    resource: input.resource,
  });
  const response = await fetch(`${input.baseUrl}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return {
    status: response.status,
    body: (await response.json()) as TokenResponse | Record<string, unknown>,
  };
}

export async function callMcpTool(
  baseUrl: string,
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  const meta = {
    [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
    [CLIENT_INFO_META_KEY]: {
      name: "nativenotes-oauth-harness",
      version: "0.1.0",
    },
    [CLIENT_CAPABILITIES_META_KEY]: {},
  };

  const discover = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "server/discover",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: { _meta: meta },
    }),
  });
  if (!discover.ok) {
    return {
      status: discover.status,
      body: await discover.json().catch(() => null),
    };
  }

  const listed = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: meta,
      },
    }),
  });

  return {
    status: listed.status,
    body: await listed.json().catch(() => null),
  };
}

export function callNoteList(
  baseUrl: string,
  accessToken: string,
  args: Record<string, unknown> = {},
) {
  return callMcpTool(baseUrl, accessToken, "note.list", args);
}

export function noteIdsFromMcpBody(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const notes = (
    body as {
      result?: { structuredContent?: { notes?: unknown } };
    }
  ).result?.structuredContent?.notes;
  if (!Array.isArray(notes)) return [];
  return notes
    .map((note) =>
      note && typeof note === "object" && "id" in note
        ? String((note as { id: unknown }).id)
        : null,
    )
    .filter((id): id is string => typeof id === "string");
}

export async function authorizeForOrganization(input: {
  baseUrl: string;
  jar: CookieJar;
  organizationId: string;
  resource: string;
  scopes?: string;
}): Promise<{ code: string; verifier: string; state: string }> {
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString("hex");
  const authorize = new URL("/api/auth/oauth2/authorize", input.baseUrl);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", HARNESS_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", HARNESS_REDIRECT_URI);
  authorize.searchParams.set(
    "scope",
    input.scopes ?? "openid offline_access mcp:read",
  );
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("resource", input.resource);

  const landed = await followRedirects(input.jar, authorize.toString());
  if (!landed.url.includes("/oauth/consent")) {
    throw new Error(`expected consent page, landed on ${landed.url}`);
  }

  const oauthQuery = new URL(landed.url).search.startsWith("?")
    ? new URL(landed.url).search.slice(1)
    : new URL(landed.url).search;

  const consent = await fetchWithCookies(input.jar, landed.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      organization_id: input.organizationId,
      oauth_query: oauthQuery,
      accept: "true",
    }),
  });

  const location = consent.headers.get("location");
  let redirectTarget = location;
  if (!redirectTarget) {
    const contentType = consent.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await consent
        .clone()
        .json()
        .catch(() => null)) as {
        redirect_uri?: string;
        url?: string;
        redirect?: boolean;
      } | null;
      redirectTarget =
        body?.redirect_uri ??
        (body?.redirect === true && typeof body.url === "string"
          ? body.url
          : null);
    }
  }
  if (!redirectTarget) {
    const body = await consent.text();
    throw new Error(
      `consent did not redirect (${consent.status}): ${body.slice(0, 500)}`,
    );
  }

  const redirected = new URL(redirectTarget, landed.url);
  if (!redirected.toString().startsWith(HARNESS_REDIRECT_URI)) {
    const followed = await followRedirects(input.jar, redirected.toString());
    const code = new URL(followed.url).searchParams.get("code");
    if (!code) throw new Error(`missing code at ${followed.url}`);
    return { code, verifier, state };
  }

  const code = redirected.searchParams.get("code");
  if (!code) throw new Error(`missing code at ${redirected.toString()}`);
  return { code, verifier, state };
}

export { and, eq, inArray, randomUUID };
