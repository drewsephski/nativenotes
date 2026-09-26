import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { startNativeNotesServer } from "../src/server/index.js";

const TEST_PORT = "3310";
const TEST_BASE = `http://127.0.0.1:${TEST_PORT}`;

// DATABASE_URL is bound to TEST_DATABASE_URL in tests/setup.ts.
process.env.BETTER_AUTH_SECRET =
  "local-development-secret-that-is-long-enough-123456";
process.env.BETTER_AUTH_URL = TEST_BASE;
process.env.MCP_RESOURCE_URL = `${TEST_BASE}/mcp`;
process.env.TENANT_CLAIM_NAMESPACE = "https://nativenotes.example/claims";
process.env.NODE_ENV = "test";
process.env.PORT = TEST_PORT;
// Test-only Google credentials; provider network exchange is mocked below.
process.env.GOOGLE_CLIENT_ID = "oauth-lifecycle-test";
process.env.GOOGLE_CLIENT_SECRET = "oauth-lifecycle-test-secret";

const {
  HARNESS_CLIENT_ID,
  authorizeForOrganization,
  callNoteList,
  callMcpTool,
  createCookieJar,
  cookieHeader,
  decodeAccessToken,
  exchangeAuthorizationCode,
  fetchWithCookies,
  noteIdsFromMcpBody,
  refreshAccessToken,
  and,
  eq,
  inArray,
  randomUUID,
} = await import("./oauth-harness.js");
const { db, sql } = await import("../src/db/client.js");
const {
  oauthClient,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  verification,
  member,
  organization,
  user,
  account,
  session,
} = await import("../src/db/auth-schema.js");
const { notes, oauthGrantTenant } = await import("../src/db/schema.js");
const { tenantClaim, env, betterAuthIssuer } =
  await import("../src/config/env.js");
const { migrate } = await import("../src/db/migrate.js");

type Started = Awaited<ReturnType<typeof startNativeNotesServer>>;

describe("OAuth organization-bound lifecycle", () => {
  let started: Started;
  const runId = randomUUID().slice(0, 8);
  const email = `oauth-${runId}@nativenotes.test`;
  const password = "lifecycle-password-123";
  const jar = createCookieJar();

  let userId = "";
  let orgA = "";
  let orgB = "";
  let noteA = "";
  let noteB = "";
  let grantA!: {
    accessToken: string;
    refreshToken: string;
    claims: Record<string, unknown>;
  };
  let grantB!: {
    accessToken: string;
    refreshToken: string;
    claims: Record<string, unknown>;
  };
  const findings: Record<string, unknown> = {};

  beforeAll(async () => {
    await migrate();
    // Auth initialization seeds OAuth resources, so a fresh test database must
    // be migrated before importing it, and initialization must finish first.
    const { startNativeNotesServer } = await import("../src/server/index.js");
    const { auth } = await import("../src/auth/auth.js");
    await auth.$context;
    await db
      .delete(oauthClientResource)
      .where(eq(oauthClientResource.clientId, HARNESS_CLIENT_ID));
    await db
      .delete(oauthClient)
      .where(eq(oauthClient.clientId, HARNESS_CLIENT_ID));

    const now = new Date();
    await db.insert(oauthClient).values({
      id: randomUUID(),
      clientId: HARNESS_CLIENT_ID,
      clientSecret: null,
      disabled: false,
      skipConsent: false,
      scopes: [
        "openid",
        "offline_access",
        "mcp:read",
        "mcp:write",
        "mcp:instructions",
        "mcp:admin",
      ],
      redirectUris: ["http://127.0.0.1/oauth/harness/callback"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      requirePKCE: true,
      name: "NativeNotes OAuth Harness",
      createdAt: now,
      updatedAt: now,
    });

    started = await startNativeNotesServer(Number(TEST_PORT));

    // Link harness client after MCP plugin seeds the resource row.
    await db.insert(oauthClientResource).values({
      id: randomUUID(),
      clientId: HARNESS_CLIENT_ID,
      resourceId: env.MCP_RESOURCE_URL,
      createdAt: now,
    });

    const signUp = await fetchWithCookies(
      jar,
      `${TEST_BASE}/api/auth/sign-up/email`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `OAuth User ${runId}`,
          email,
          password,
        }),
      },
    );
    expect(signUp.ok).toBe(true);
    const signed = (await signUp.json()) as { user?: { id?: string } };
    userId = signed.user?.id ?? "";
    expect(userId).toBeTruthy();
    // Existing linked Google account: account-linking policy is outside this test.
    await db.insert(account).values({
      id: randomUUID(),
      accountId: `google-${runId}`,
      providerId: "google",
      userId,
      createdAt: now,
      updatedAt: now,
    });

    const createOrg = async (
      name: string,
      slug: string,
      keepCurrent: boolean,
    ) => {
      const response = await fetchWithCookies(
        jar,
        `${TEST_BASE}/api/auth/organization/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: cookieHeader(jar),
          },
          body: JSON.stringify({
            name,
            slug,
            keepCurrentActiveOrganization: keepCurrent,
          }),
        },
      );
      expect(response.ok).toBe(true);
      const body = (await response.json()) as { id?: string };
      expect(body.id).toBeTruthy();
      return body.id!;
    };

    orgA = await createOrg(`Org A ${runId}`, `org-a-${runId}`, false);
    orgB = await createOrg(`Org B ${runId}`, `org-b-${runId}`, true);

    noteA = `note-a-${runId}`;
    noteB = `note-b-${runId}`;
    await db.insert(notes).values([
      {
        id: noteA,
        tenantId: orgA,
        title: "Note A",
        body: "tenant A",
      },
      {
        id: noteB,
        tenantId: orgB,
        title: "Note B",
        body: "tenant B",
      },
    ]);
  }, 120_000);

  afterAll(async () => {
    if (userId) {
      await db
        .delete(notes)
        .where(inArray(notes.id, [noteA, noteB].filter(Boolean)));
      await db
        .delete(oauthGrantTenant)
        .where(eq(oauthGrantTenant.userId, userId));
      await db.delete(oauthConsent).where(eq(oauthConsent.userId, userId));
      await db
        .delete(oauthRefreshToken)
        .where(eq(oauthRefreshToken.userId, userId));
      await db.delete(session).where(eq(session.userId, userId));
      await db.delete(account).where(eq(account.userId, userId));
      await db.delete(member).where(eq(member.userId, userId));
      await db
        .delete(organization)
        .where(inArray(organization.id, [orgA, orgB].filter(Boolean)));
      await db.delete(user).where(eq(user.id, userId));
    }
    await db
      .delete(oauthClientResource)
      .where(eq(oauthClientResource.clientId, HARNESS_CLIENT_ID));
    await db
      .delete(oauthClient)
      .where(eq(oauthClient.clientId, HARNESS_CLIENT_ID));
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => (error ? reject(error) : resolve()));
    });
    await sql.end({ timeout: 5 });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      new URL("../docs/oauth-lifecycle-findings.json", import.meta.url),
      `${JSON.stringify(findings, null, 2)}\n`,
    );
  }, 60_000);

  async function signedLoginQuery(
    loginJar: ReturnType<typeof createCookieJar>,
  ) {
    const { createPkcePair, followRedirects } =
      await import("./oauth-harness.js");
    const authorize = new URL("/api/auth/oauth2/authorize", TEST_BASE);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: HARNESS_CLIENT_ID,
      redirect_uri: "http://127.0.0.1/oauth/harness/callback",
      scope: "openid mcp:read",
      state: "login-intent-proof",
      resource: env.MCP_RESOURCE_URL,
      code_challenge: createPkcePair().challenge,
      code_challenge_method: "S256",
    }).toString();
    const landed = await followRedirects(loginJar, authorize.toString());
    const login = new URL(landed.url);
    expect(login.pathname).toBe("/sign-in");
    expect(login.searchParams.has("sig")).toBe(true);
    return login.search.slice(1);
  }

  it("email login with real signed OAuth intent reaches consent before app callback", async () => {
    const loginJar = createCookieJar();
    const query = await signedLoginQuery(loginJar);
    const response = await fetchWithCookies(loginJar, `${TEST_BASE}/sign-in`, {
      method: "POST",
      headers: { origin: TEST_BASE },
      body: new URLSearchParams({
        email,
        password,
        oauth_query: query,
        callbackURL: `${TEST_BASE}/app`,
      }),
    });
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!, TEST_BASE).pathname).toBe(
      "/oauth/consent",
    );
  }, 30_000);

  it.each([false, true])(
    "Google round trip restores signed OAuth intent=%s",
    async (isOAuth) => {
      const { auth } = await import("../src/auth/auth.js");
      const context = await auth.$context;
      const google = context.socialProviders.find(
        (provider) => provider.id === "google",
      );
      if (!google) throw new Error("Missing test Google provider");
      const validate = vi
        .spyOn(google, "validateAuthorizationCode")
        .mockResolvedValue({ accessToken: "test-google-token" });
      const profile = vi.spyOn(google, "getUserInfo").mockResolvedValue({
        user: {
          email,
          emailVerified: true,
          name: `OAuth User ${runId}`,
        },
        data: { sub: `google-${runId}`, email },
      });
      try {
        const loginJar = createCookieJar();
        const fields: Record<string, string> = isOAuth
          ? {
              oauth_query: await signedLoginQuery(loginJar),
              callbackURL: `${TEST_BASE}/app`,
            }
          : {};
        const start = await fetchWithCookies(
          loginJar,
          `${TEST_BASE}/sign-in/google`,
          {
            method: "POST",
            headers: { origin: TEST_BASE },
            body: new URLSearchParams(fields),
          },
        );
        expect(start.status).toBe(303);
        const googleUrl = new URL(start.headers.get("location")!);
        expect(googleUrl.hostname).toBe("accounts.google.com");
        expect(googleUrl.searchParams.get("redirect_uri")).toBe(
          `${TEST_BASE}/api/auth/callback/google`,
        );
        const state = googleUrl.searchParams.get("state");
        expect(state).toBeTruthy();
        const callback = new URL("/api/auth/callback/google", TEST_BASE);
        callback.search = new URLSearchParams({
          state: state!,
          code: "test-google-code",
        }).toString();
        const finish = await fetchWithCookies(loginJar, callback, {
          headers: { accept: "text/html" },
        });
        const target = new URL(finish.headers.get("location")!, TEST_BASE);
        expect(target.searchParams.has("error")).toBe(false);
        if (isOAuth) {
          expect(["/api/auth/oauth2/authorize", "/oauth/consent"]).toContain(
            target.pathname,
          );
          const { followRedirects } = await import("./oauth-harness.js");
          const landed = await followRedirects(loginJar, target.toString());
          const consent = new URL(landed.url);
          expect(consent.pathname).toBe("/oauth/consent");
          expect(consent.searchParams.get("state")).toBe("login-intent-proof");
          expect(consent.searchParams.get("client_id")).toBe(HARNESS_CLIENT_ID);
        } else {
          expect(target.pathname).toBe("/app");
        }
        const sessionResponse = await fetchWithCookies(
          loginJar,
          `${TEST_BASE}/api/auth/get-session`,
        );
        const sessionBody = (await sessionResponse.json()) as {
          user?: { id: string };
        };
        expect(sessionBody.user?.id).toBe(userId);
      } finally {
        validate.mockRestore();
        profile.mockRestore();
      }
    },
    30_000,
  );

  it("A: authorizes for Organization A and scopes note.list", async () => {
    const { code, verifier } = await authorizeForOrganization({
      baseUrl: TEST_BASE,
      jar,
      organizationId: orgA,
      resource: env.MCP_RESOURCE_URL,
    });

    const tokens = await exchangeAuthorizationCode({
      baseUrl: TEST_BASE,
      code,
      verifier,
      resource: env.MCP_RESOURCE_URL,
    });
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();

    const claims = decodeAccessToken(tokens.access_token);
    expect(claims.sub).toBe(userId);
    expect(claims[tenantClaim]).toBe(orgA);
    const audience = claims.aud;
    const audienceValues = Array.isArray(audience)
      ? audience
      : [audience].filter(Boolean);
    expect(audienceValues).toContain(env.MCP_RESOURCE_URL);
    expect(String(claims.scope)).toContain("mcp:read");
    expect(claims.iss).toBe(betterAuthIssuer);

    const listed = await callNoteList(TEST_BASE, tokens.access_token);
    expect(listed.status).toBe(200);
    const ids = noteIdsFromMcpBody(listed.body);
    expect(ids).toContain(noteA);
    expect(ids).not.toContain(noteB);

    grantA = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      claims,
    };

    const consentRows = await db
      .select()
      .from(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, userId),
          eq(oauthConsent.clientId, HARNESS_CLIENT_ID),
        ),
      );
    const refreshRows = await db
      .select()
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.clientId, HARNESS_CLIENT_ID),
        ),
      );
    const verificationRows = await db.select().from(verification);
    const authCodeRows = verificationRows.filter((row) => {
      try {
        const value = JSON.parse(row.value) as { type?: string };
        return value.type === "authorization_code";
      } catch {
        return false;
      }
    });

    findings.referenceIdLifecycle = {
      consentReferenceIds: consentRows.map((row) => row.referenceId),
      refreshReferenceIds: refreshRows.map((row) => row.referenceId),
      authorizationCodeReferenceIds: authCodeRows.map((row) => {
        try {
          return (JSON.parse(row.value) as { referenceId?: string })
            .referenceId;
        } catch {
          return null;
        }
      }),
    };

    const bindings = await db
      .select()
      .from(oauthGrantTenant)
      .where(
        and(
          eq(oauthGrantTenant.userId, userId),
          eq(oauthGrantTenant.organizationId, orgA),
        ),
      );
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.revokedAt).toBeNull();
    expect(bindings[0]?.oauthClientId).toBe(HARNESS_CLIENT_ID);
    expect(bindings[0]?.resource).toBe(env.MCP_RESOURCE_URL);
    findings.grantA = bindings[0];
  }, 60_000);

  it("B: active-org drift does not change grant A on refresh", async () => {
    const setActive = await fetchWithCookies(
      jar,
      `${TEST_BASE}/api/auth/organization/set-active`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: orgB }),
      },
    );
    expect(setActive.ok).toBe(true);

    const refreshed = await refreshAccessToken({
      baseUrl: TEST_BASE,
      refreshToken: grantA.refreshToken,
      resource: env.MCP_RESOURCE_URL,
    });
    expect(refreshed.status).toBe(200);
    const body = refreshed.body as {
      access_token: string;
      refresh_token?: string;
    };
    expect(body.access_token).toBeTruthy();
    const claims = decodeAccessToken(body.access_token);
    expect(claims[tenantClaim]).toBe(orgA);
    expect(claims.sub).toBe(userId);

    grantA = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? grantA.refreshToken,
      claims,
    };
    findings.activeOrgDrift = {
      activeOrganizationId: orgB,
      refreshedTenantClaim: claims[tenantClaim],
    };
  }, 60_000);

  it("C: independent Organization B authorization", async () => {
    const { code, verifier } = await authorizeForOrganization({
      baseUrl: TEST_BASE,
      jar,
      organizationId: orgB,
      resource: env.MCP_RESOURCE_URL,
    });
    const tokens = await exchangeAuthorizationCode({
      baseUrl: TEST_BASE,
      code,
      verifier,
      resource: env.MCP_RESOURCE_URL,
    });
    const claims = decodeAccessToken(tokens.access_token);
    expect(claims[tenantClaim]).toBe(orgB);

    const listedB = await callNoteList(TEST_BASE, tokens.access_token);
    expect(listedB.status).toBe(200);
    const idsB = noteIdsFromMcpBody(listedB.body);
    expect(idsB).toContain(noteB);
    expect(idsB).not.toContain(noteA);

    const listedA = await callNoteList(TEST_BASE, grantA.accessToken);
    expect(listedA.status).toBe(200);
    const idsA = noteIdsFromMcpBody(listedA.body);
    expect(idsA).toContain(noteA);
    expect(idsA).not.toContain(noteB);

    const refreshedA = await refreshAccessToken({
      baseUrl: TEST_BASE,
      refreshToken: grantA.refreshToken,
      resource: env.MCP_RESOURCE_URL,
    });
    expect(refreshedA.status).toBe(200);
    const refreshedClaims = decodeAccessToken(
      (refreshedA.body as { access_token: string }).access_token,
    );
    expect(refreshedClaims[tenantClaim]).toBe(orgA);

    grantB = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      claims,
    };

    const bindings = await db
      .select()
      .from(oauthGrantTenant)
      .where(eq(oauthGrantTenant.userId, userId));
    expect(bindings.length).toBeGreaterThanOrEqual(2);
    expect(bindings.some((row) => row.organizationId === orgA)).toBe(true);
    expect(bindings.some((row) => row.organizationId === orgB)).toBe(true);
    findings.grantB = bindings.find((row) => row.organizationId === orgB);
    findings.independentGrants = bindings.map((row) => ({
      organizationId: row.organizationId,
      stableGrantIdentifier: row.stableGrantIdentifier,
      revokedAt: row.revokedAt,
    }));
  }, 60_000);

  it("D: membership removal rejects request-time access for grant A", async () => {
    await db
      .delete(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, orgA)));

    const listed = await callNoteList(TEST_BASE, grantA.accessToken);
    expect(listed.status).toBe(403);
    expect(listed.body).toMatchObject({
      error: "forbidden",
    });

    // Restore membership for cleanup / later assertions.
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: orgA,
      userId,
      role: "owner",
      createdAt: new Date(),
    });
    findings.membershipRemoval = {
      status: listed.status,
      body: listed.body,
    };
  }, 60_000);

  it("E: refresh rotation and reuse interval", async () => {
    const first = await refreshAccessToken({
      baseUrl: TEST_BASE,
      refreshToken: grantA.refreshToken,
      resource: env.MCP_RESOURCE_URL,
    });
    expect(first.status).toBe(200);
    const firstBody = first.body as {
      access_token: string;
      refresh_token?: string;
    };
    const firstClaims = decodeAccessToken(firstBody.access_token);
    expect(firstClaims[tenantClaim]).toBe(orgA);

    const reused = await refreshAccessToken({
      baseUrl: TEST_BASE,
      refreshToken: grantA.refreshToken,
      resource: env.MCP_RESOURCE_URL,
    });
    findings.refreshReuse = {
      firstStatus: first.status,
      reuseStatus: reused.status,
      reuseBodyKeys: Object.keys(reused.body),
      tenantUnchanged:
        "access_token" in reused.body
          ? decodeAccessToken(
              (reused.body as { access_token: string }).access_token,
            )[tenantClaim] === orgA
          : false,
      observed:
        reused.status === 200
          ? "immediate reuse within refreshTokenReuseInterval=30 returned a token response"
          : "immediate reuse was rejected by Better Auth",
    };

    if (reused.status === 200 && "access_token" in reused.body) {
      expect(
        decodeAccessToken(
          (reused.body as { access_token: string }).access_token,
        )[tenantClaim],
      ).toBe(orgA);
    }

    grantA = {
      accessToken: firstBody.access_token,
      refreshToken: firstBody.refresh_token ?? grantA.refreshToken,
      claims: firstClaims,
    };
  }, 60_000);

  it("security: rejects invalid audience, missing scope, foreign tenant args, non-member consent", async () => {
    const pkce = await import("./oauth-harness.js");

    // tenant_id arg must not change scoping
    const withTenantArg = await callNoteList(TEST_BASE, grantB.accessToken, {
      tenant_id: orgA,
    });
    expect(withTenantArg.status).toBe(200);
    const ids = noteIdsFromMcpBody(withTenantArg.body);
    expect(ids).toContain(noteB);
    expect(ids).not.toContain(noteA);

    const anonymous = await fetch(`${TEST_BASE}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "server/discover",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: {},
      }),
    });
    expect(anonymous.status).toBe(401);

    // Consent cannot select an org the user does not belong to.
    const foreignOrg = randomUUID();
    const authorize = new URL("/api/auth/oauth2/authorize", TEST_BASE);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", HARNESS_CLIENT_ID);
    authorize.searchParams.set(
      "redirect_uri",
      "http://127.0.0.1/oauth/harness/callback",
    );
    authorize.searchParams.set("scope", "openid offline_access mcp:read");
    const pair = pkce.createPkcePair();
    authorize.searchParams.set("code_challenge", pair.challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("state", "sec");
    authorize.searchParams.set("resource", env.MCP_RESOURCE_URL);

    const landed = await pkce.followRedirects(jar, authorize.toString());
    const oauthQuery = new URL(landed.url).search.slice(1);
    const rejected = await fetchWithCookies(jar, landed.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        organization_id: foreignOrg,
        oauth_query: oauthQuery,
        accept: "true",
      }),
    });
    expect(rejected.status).toBe(403);

    findings.security = {
      tenantArgIgnored: true,
      anonymousRejected: anonymous.status,
      foreignOrgConsent: rejected.status,
    };
  }, 60_000);
  it("MCP writes require scopes, preserve grant tenant and reject stale versions and removed members", async () => {
    const readonly = await callMcpTool(
      TEST_BASE,
      grantA.accessToken,
      "note.create",
      { title: "Denied", body: "" },
    );
    expect(JSON.stringify(readonly.body)).toMatch(
      /error|not found|not available/i,
    );
    const authorized = await authorizeForOrganization({
      baseUrl: TEST_BASE,
      jar,
      organizationId: orgA,
      resource: env.MCP_RESOURCE_URL,
      scopes: "openid offline_access mcp:read mcp:write mcp:instructions",
    });
    const token = await exchangeAuthorizationCode({
      baseUrl: TEST_BASE,
      code: authorized.code,
      verifier: authorized.verifier,
      resource: env.MCP_RESOURCE_URL,
    });
    await fetchWithCookies(
      jar,
      `${TEST_BASE}/api/auth/organization/set-active`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: orgB }),
      },
    );
    function output(result: { body: unknown }) {
      const envelope = result.body as {
        result?: { isError?: boolean; content?: { text: string }[] };
      };
      expect(envelope.result?.isError).not.toBe(true);
      return JSON.parse(envelope.result!.content![0]!.text) as {
        id: string;
        version: number;
      };
    }
    const created = output(
      await callMcpTool(TEST_BASE, token.access_token, "note.create", {
        title: "MCP scoped write",
        body: "v1",
        tenantId: orgB,
      }),
    );
    try {
      const stored = await db
        .select()
        .from(notes)
        .where(eq(notes.id, created.id));
      expect(stored[0]?.tenantId).toBe(orgA);
      const updated = output(
        await callMcpTool(TEST_BASE, token.access_token, "note.update", {
          id: created.id,
          title: "MCP scoped write",
          body: "v2",
          expectedVersion: 1,
        }),
      );
      expect(updated.version).toBe(2);
      const stale = await callMcpTool(
        TEST_BASE,
        token.access_token,
        "note.update",
        { id: created.id, title: "bad", body: "bad", expectedVersion: 1 },
      );
      expect(JSON.stringify(stale.body)).toContain("version_conflict");
      const foreign = await callMcpTool(
        TEST_BASE,
        token.access_token,
        "note.favorite",
        { id: noteB, favorited: true, tenantId: orgB },
      );
      expect(JSON.stringify(foreign.body)).toContain("not_found");
      await db
        .delete(member)
        .where(and(eq(member.userId, userId), eq(member.organizationId, orgA)));
      const removed = await callMcpTool(
        TEST_BASE,
        token.access_token,
        "note.favorite",
        { id: created.id, favorited: true },
      );
      expect(removed.status).toBe(403);
    } finally {
      await db
        .delete(notes)
        .where(and(eq(notes.tenantId, orgA), eq(notes.id, created.id)));
      const membership = await db
        .select()
        .from(member)
        .where(and(eq(member.userId, userId), eq(member.organizationId, orgA)));
      if (!membership.length)
        await db
          .insert(member)
          .values({
            id: randomUUID(),
            organizationId: orgA,
            userId,
            role: "owner",
            createdAt: new Date(),
          });
    }
  }, 60_000);
});
