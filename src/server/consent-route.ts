import type { IncomingMessage, ServerResponse } from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../auth/auth.js";
import { withSelectedOrganization } from "../auth/consent-selection.js";
import { env } from "../config/env.js";
import { writeHtml } from "../ui/html.js";
import {
  renderConsentPage,
  renderSimpleStatusPage,
  type OrganizationOption,
} from "../ui/pages.js";

type Organization = OrganizationOption;
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

async function readBody(
  request: IncomingMessage,
): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  return Object.fromEntries(body.entries());
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

async function completeConsent(input: {
  request: IncomingMessage;
  response: ServerResponse;
  organizationId: string | undefined;
  oauthQuery: string;
  accept: boolean;
  scope?: string;
  claims?: string;
}): Promise<void> {
  const {
    request,
    response,
    organizationId,
    oauthQuery,
    accept,
    scope,
    claims,
  } = input;

  if (accept && !organizationId) {
    writeHtml(
      response,
      400,
      renderSimpleStatusPage({
        title: "Workspace required",
        message: "Select a workspace before approving access.",
        statusTone: "error",
      }),
    );
    return;
  }

  console.info("[oauth]", {
    stage: accept ? "consent_submit" : "consent_deny",
    clientId: clientIdFromOAuthQuery(oauthQuery),
    scopes: scopesFromOAuthQuery(oauthQuery) ?? scope,
    organizationId,
  });

  if (accept && organizationId) {
    await organizationApi.setActiveOrganization({
      headers: fromNodeHeaders(request.headers),
      body: { organizationId },
    });
  }

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
        accept,
        ...(scope ? { scope } : {}),
        ...(claims ? { claims } : {}),
        ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
      }),
    },
  );

  const consentResponse = organizationId
    ? await withSelectedOrganization(organizationId, () =>
        auth.handler(consentRequest),
      )
    : await auth.handler(consentRequest);

  const setCookie = consentResponse.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) response.setHeader("set-cookie", setCookie);

  const location = consentResponse.headers.get("location");
  if (location) {
    console.info("[oauth]", {
      stage: accept ? "consent_redirect" : "consent_denied_redirect",
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
      renderSimpleStatusPage({
        title: accept ? "Consent failed" : "Unable to deny",
        message:
          payload?.error_description ??
          payload?.error ??
          "Unable to complete consent",
        statusTone: "error",
      }),
    );
    return;
  }

  console.info("[oauth]", {
    stage: accept ? "consent_redirect" : "consent_denied_redirect",
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
      renderSimpleStatusPage({
        title: "Sign-in required",
        message: "Authenticate before approving an MCP client.",
        statusTone: "error",
      }),
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
      renderConsentPage({
        organizations,
        oauthQuery,
        userName: session.user.name,
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
  const oauthQuery = body.oauth_query ?? "";

  if (body.action === "deny" || body.accept === "false") {
    await completeConsent({
      request,
      response,
      organizationId: undefined,
      oauthQuery,
      accept: false,
      scope: body.scope,
      claims: body.claims,
    });
    return;
  }

  if (body.action === "create_organization") {
    const name = body.organization_name?.trim();
    if (!name) {
      writeHtml(
        response,
        400,
        renderConsentPage({
          organizations: await organizationApi.listOrganizations({ headers }),
          oauthQuery,
          userName: session.user.name,
          message: {
            text: "Workspace name is required.",
            tone: "error",
          },
        }),
      );
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
        renderConsentPage({
          organizations: await organizationApi.listOrganizations({ headers }),
          oauthQuery,
          userName: session.user.name,
          message: {
            text:
              error instanceof Error
                ? error.message
                : "Unable to create workspace",
            tone: "error",
          },
        }),
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
        userName: session.user.name,
        selectedOrganizationId: created.id,
        message: {
          text: `Created ${created.name}. Review access and approve to continue.`,
          tone: "info",
        },
      }),
    );
    return;
  }

  const organizationId = body.organization_id;
  if (!organizationId) {
    writeHtml(
      response,
      400,
      renderConsentPage({
        organizations: await organizationApi.listOrganizations({ headers }),
        oauthQuery,
        userName: session.user.name,
        message: {
          text: "Select a workspace to continue.",
          tone: "error",
        },
      }),
    );
    return;
  }

  const organizations = await organizationApi.listOrganizations({ headers });
  const selected = organizations.find(
    (organization) => organization.id === organizationId,
  );
  if (!selected) {
    writeHtml(
      response,
      403,
      renderSimpleStatusPage({
        title: "Workspace unavailable",
        message: "That workspace is not available for your account.",
        statusTone: "error",
      }),
    );
    return;
  }

  await completeConsent({
    request,
    response,
    organizationId,
    oauthQuery,
    accept: body.accept === "true",
    scope: body.scope,
    claims: body.claims,
  });
}
