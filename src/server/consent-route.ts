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
  createOrganization(input: {
    headers: Headers;
    body: {
      name: string;
      slug: string;
      keepCurrentActiveOrganization?: boolean;
    };
  }): Promise<Organization>;
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

function clientIdFromOAuthQuery(oauthQuery: string): string | undefined {
  try {
    const params = new URLSearchParams(oauthQuery);
    const clientId = params.get("client_id");
    return clientId ?? undefined;
  } catch {
    return undefined;
  }
}

function scopesFromOAuthQuery(oauthQuery: string): string | undefined {
  try {
    return new URLSearchParams(oauthQuery).get("scope") ?? undefined;
  } catch {
    return undefined;
  }
}

function slugifyOrganizationName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : `org-${Date.now()}`;
}

function renderConsentPage(input: {
  organizations: Organization[];
  oauthQuery: string;
  message?: string;
}): string {
  const oauthQueryField = `<input type="hidden" name="oauth_query" value="${escapeHtml(input.oauthQuery)}">`;
  if (input.organizations.length === 0) {
    return `<h1>Approve NativeNotes access</h1><p>Create an organization to bind this OAuth grant. The selected organization becomes the permanent tenant for this client grant.</p>${input.message ? `<p>${escapeHtml(input.message)}</p>` : ""}<form method="post"><input type="hidden" name="action" value="create_organization">${oauthQueryField}<label>Organization name <input name="organization_name" required maxlength="80" value="Organization A"></label><button type="submit">Create organization</button></form>`;
  }

  const choices = input.organizations
    .map(
      (organization) =>
        `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`,
    )
    .join("");
  return `<h1>Approve NativeNotes access</h1><p>Select the organization this OAuth grant will be permanently bound to.</p>${input.message ? `<p>${escapeHtml(input.message)}</p>` : ""}<form method="post"><input type="hidden" name="action" value="approve">${oauthQueryField}<label>Organization <select name="organization_id" required>${choices}</select></label><input type="hidden" name="accept" value="true"><button type="submit">Continue</button></form><hr><form method="post"><input type="hidden" name="action" value="create_organization">${oauthQueryField}<label>Or create another organization <input name="organization_name" required maxlength="80" placeholder="Organization B"></label><button type="submit">Create</button></form>`;
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
    console.info("[oauth]", {
      stage: "consent_page",
      clientId: clientIdFromOAuthQuery(oauthQuery),
      scopes: scopesFromOAuthQuery(oauthQuery),
      organizationCount: organizations.length,
    });
    writeHtml(
      response,
      200,
      renderConsentPage({ organizations, oauthQuery }),
    );
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "GET, POST" });
    response.end();
    return;
  }

  const body = await readBody(request);
  const oauthQuery = body.oauth_query ?? "";

  if (body.action === "create_organization") {
    const name = body.organization_name?.trim();
    if (!name) {
      writeHtml(response, 400, "<h1>Organization name required</h1>");
      return;
    }
    let created: Organization;
    try {
      created = await organizationApi.createOrganization({
        headers,
        body: {
          name,
          slug: `${slugifyOrganizationName(name)}-${Date.now().toString(36)}`,
          keepCurrentActiveOrganization: true,
        },
      });
    } catch (error) {
      console.info("[oauth]", {
        stage: "organization_create_failed",
        clientId: clientIdFromOAuthQuery(oauthQuery),
        reason: error instanceof Error ? error.message : "unknown",
      });
      writeHtml(
        response,
        400,
        `<h1>Unable to create organization</h1><p>${escapeHtml(error instanceof Error ? error.message : "Create failed")}</p>`,
      );
      return;
    }
    console.info("[oauth]", {
      stage: "organization_created",
      clientId: clientIdFromOAuthQuery(oauthQuery),
      organizationId: created.id,
    });
    const organizations = await organizationApi.listOrganizations({ headers });
    writeHtml(
      response,
      200,
      renderConsentPage({
        organizations,
        oauthQuery,
        message: `Created ${created.name}. Select it below to bind this grant.`,
      }),
    );
    return;
  }

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

  console.info("[oauth]", {
    stage: "consent_submit",
    clientId: clientIdFromOAuthQuery(oauthQuery),
    scopes: scopesFromOAuthQuery(oauthQuery) ?? body.scope,
    organizationId,
  });

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
    console.info("[oauth]", {
      stage: "consent_redirect",
      organizationId,
      clientId: clientIdFromOAuthQuery(oauthQuery),
      hasIss: new URL(location, env.BETTER_AUTH_URL).searchParams.has("iss"),
    });
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
    console.info("[oauth]", {
      stage: "consent_failed",
      organizationId,
      clientId: clientIdFromOAuthQuery(oauthQuery),
      error: payload?.error,
    });
    writeHtml(
      response,
      consentResponse.status >= 400 ? consentResponse.status : 400,
      `<h1>Consent failed</h1><p>${escapeHtml(payload?.error_description ?? payload?.error ?? "Unable to complete consent")}</p>`,
    );
    return;
  }

  console.info("[oauth]", {
    stage: "consent_redirect",
    organizationId,
    clientId: clientIdFromOAuthQuery(oauthQuery),
    hasIss: new URL(redirectUri, env.BETTER_AUTH_URL).searchParams.has("iss"),
  });

  response.writeHead(303, {
    location: redirectUri,
    "cache-control": "no-store",
  });
  response.end();
}
