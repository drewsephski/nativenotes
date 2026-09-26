import type { IncomingMessage, ServerResponse } from "node:http";

import { auth } from "../auth/auth.js";
import { withSelectedOrganization } from "../auth/consent-selection.js";
import { fromNodeHeaders } from "better-auth/node";

type Organization = { id: string; name: string };
type OrganizationApi = {
  listOrganizations(input: { headers: Headers }): Promise<Organization[]>;
  setActiveOrganization(input: {
    headers: Headers;
    body: { organizationId: string };
  }): Promise<unknown>;
  oauth2Consent(input: {
    headers: Headers;
    body: {
      accept: boolean;
      scope?: string;
      claims?: string;
      oauth_query?: string;
    };
  }): Promise<{ redirect_uri?: string }>;
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
    const oauthQuery = url.searchParams.get("oauth_query") ?? "";
    const choices = organizations
      .map(
        (organization) =>
          `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`,
      )
      .join("");
    writeHtml(
      response,
      200,
      `<h1>Approve Hjarni access</h1><p>Select the organization this OAuth grant will be permanently bound to.</p><form method="post"><label>Organization <select name="organization_id" required>${choices}</select></label><input type="hidden" name="oauth_query" value="${escapeHtml(oauthQuery)}"><input type="hidden" name="accept" value="true"><button type="submit">Continue</button></form>`,
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
  const result = await withSelectedOrganization(organizationId, () =>
    organizationApi.oauth2Consent({
      headers,
      body: {
        accept: body.accept === "true",
        ...(body.scope ? { scope: body.scope } : {}),
        ...(body.claims ? { claims: body.claims } : {}),
        ...(body.oauth_query ? { oauth_query: body.oauth_query } : {}),
      },
    }),
  );

  const redirectUri =
    typeof result === "object" &&
    result !== null &&
    "redirect_uri" in result &&
    typeof result.redirect_uri === "string"
      ? result.redirect_uri
      : "/";
  response.writeHead(303, {
    location: redirectUri,
    "cache-control": "no-store",
  });
  response.end();
}
