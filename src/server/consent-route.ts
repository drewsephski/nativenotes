import type { IncomingMessage, ServerResponse } from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../auth/auth.js";
import { withSelectedOrganization } from "../auth/consent-selection.js";
import { env } from "../config/env.js";

type Organization = { id: string; name: string };
type OrganizationApi = {
  listOrganizations(input: { headers: Headers }): Promise<Organization[]>;
  setActiveOrganization(input: {
    headers: Headers;
    body: { organizationId: string };
  }): Promise<unknown>;
};

const organizationApi = auth.api as unknown as OrganizationApi;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

async function readBody(
  request: IncomingMessage,
): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  return Object.fromEntries(body.entries());
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

export async function handleConsentRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const headers = fromNodeHeaders(request.headers);
  const session = await auth.api.getSession({ headers });
  if (!session) {
    writeHtml(
      response,
      401,
      "<h1>Sign-in required</h1><p>Authenticate before approving an MCP client.</p>",
    );
    return;
  }

  if (request.method === "GET") {
    const organizations = await organizationApi.listOrganizations({ headers });
    const url = new URL(request.url ?? "/oauth/consent", "http://localhost");
    // Better Auth redirects with the signed OAuth query as the page query string.
    const oauthQuery = url.search.startsWith("?")
      ? url.search.slice(1)
      : url.search;
    const choices = organizations
      .map(
        (organization) =>
          `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`,
      )
      .join("");
    writeHtml(
      response,
      200,
      `<h1>Approve NativeNotes access</h1><p>Select the organization this OAuth grant will be permanently bound to.</p><form method="post"><label>Organization <select name="organization_id" required>${choices}</select></label><input type="hidden" name="oauth_query" value="${escapeHtml(oauthQuery)}"><input type="hidden" name="accept" value="true"><button type="submit">Continue</button></form>`,
    );
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "GET, POST" });
    response.end();
    return;
  }

  const body = await readBody(request);
  const organizationId = body.organization_id;
  if (!organizationId) {
    writeHtml(response, 400, "<h1>Organization selection required</h1>");
    return;
  }

  const organizations = await organizationApi.listOrganizations({ headers });
  const selected = organizations.find(
    (organization) => organization.id === organizationId,
  );
  if (!selected) {
    writeHtml(response, 403, "<h1>Organization selection rejected</h1>");
    return;
  }

  await organizationApi.setActiveOrganization({
    headers,
    body: { organizationId },
  });

  // auth.api.oauth2Consent has no ctx.request, and authorize requires one.
  // Call the real HTTP consent endpoint inside ALS so referenceId binds.
  const consentRequest = new Request(
    new URL("/api/auth/oauth2/consent", env.BETTER_AUTH_URL),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        cookie: request.headers.cookie ?? "",
      },
      body: JSON.stringify({
        accept: body.accept === "true",
        ...(body.scope ? { scope: body.scope } : {}),
        ...(body.claims ? { claims: body.claims } : {}),
        ...(body.oauth_query ? { oauth_query: body.oauth_query } : {}),
      }),
    },
  );

  const consentResponse = await withSelectedOrganization(organizationId, () =>
    auth.handler(consentRequest),
  );

  const setCookie = consentResponse.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) response.setHeader("set-cookie", setCookie);

  const location = consentResponse.headers.get("location");
  if (location) {
    response.writeHead(303, {
      location,
      "cache-control": "no-store",
    });
    response.end();
    return;
  }

  const payload = (await consentResponse.json().catch(() => null)) as {
    redirect_uri?: string;
    redirect?: boolean;
    url?: string;
    error?: string;
    error_description?: string;
  } | null;

  const redirectUri =
    payload?.redirect_uri ??
    (payload?.redirect === true && typeof payload.url === "string"
      ? payload.url
      : null);

  if (!redirectUri) {
    writeHtml(
      response,
      consentResponse.status >= 400 ? consentResponse.status : 400,
      `<h1>Consent failed</h1><p>${escapeHtml(payload?.error_description ?? payload?.error ?? "Unable to complete consent")}</p>`,
    );
    return;
  }

  response.writeHead(303, {
    location: redirectUri,
    "cache-control": "no-store",
  });
  response.end();
}
