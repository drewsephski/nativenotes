import { createServer, type Server } from "node:http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { handler } = vi.hoisted(() => ({ handler: vi.fn() }));
vi.mock("../src/auth/auth.js", () => ({ auth: { handler } }));
vi.mock("../src/config/env.js", () => ({
  env: { BETTER_AUTH_URL: "https://nativenotes.app" },
  publicOrigin: "https://nativenotes.app",
  trustedOrigins: ["https://nativenotes.app"],
  googleOAuthEnabled: true,
}));
const { handleSignInRoute, handleGoogleSignInRoute } =
  await import("../src/server/auth-routes.js");
const oauthQuery =
  "client_id=https%3A%2F%2Fchatgpt.com%2Foauth%2Fclient.json&scope=mcp%3Aread&sig=signed&exp=9999999999";
let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    const route = req.url?.startsWith("/sign-in/google")
      ? handleGoogleSignInRoute
      : handleSignInRoute;
    void route(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);
beforeEach(() => {
  handler.mockReset();
  handler.mockResolvedValue(
    Response.json(
      { user: { id: "u1" } },
      {
        headers: {
          "set-cookie":
            "__Secure-better-auth.session_token=test; Path=/; Secure; HttpOnly; SameSite=Lax",
        },
      },
    ),
  );
});
async function post(path: string, fields: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: "https://nativenotes.app" },
    body: new URLSearchParams({
      email: "user@example.com",
      password: "password",
      ...fields,
    }),
  });
}
async function forwardedBody() {
  return (await (handler.mock.calls[0]![0] as Request).json()) as Record<
    string,
    string
  >;
}

describe("email sign-in intent through the HTTP route", () => {
  it.each([
    [{}, "/app"],
    [
      { callbackURL: "https://nativenotes.app/app" },
      "https://nativenotes.app/app",
    ],
    [{ callbackURL: "https://evil.example/app" }, "/app"],
    [{ callbackURL: "https://user:password@nativenotes.app/app" }, "/app"],
    [
      { oauth_query: oauthQuery },
      `https://nativenotes.app/api/auth/oauth2/authorize?${oauthQuery}`,
    ],
    [
      { oauth_query: oauthQuery, callbackURL: "https://nativenotes.app/app" },
      `https://nativenotes.app/api/auth/oauth2/authorize?${oauthQuery}`,
    ],
  ])("resolves %j", async (fields, expected) => {
    const response = await post("/sign-in", fields);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(expected);
    expect(response.headers.getSetCookie()).toEqual([
      "__Secure-better-auth.session_token=test; Path=/; Secure; HttpOnly; SameSite=Lax",
    ]);
    if ("oauth_query" in fields && fields.oauth_query)
      expect((await forwardedBody()).callbackURL).toBeUndefined();
  });
  it("does not let ordinary email response URLs bypass intent", async () => {
    handler.mockResolvedValue(Response.json({ url: "https://evil.example" }));
    expect((await post("/sign-in")).headers.get("location")).toBe("/app");
  });
  it("keeps Better Auth's validated OAuth consent continuation", async () => {
    handler.mockResolvedValue(
      Response.json({
        redirect: true,
        url: "https://nativenotes.app/oauth/consent?sig=valid",
      }),
    );
    expect(
      (
        await post("/sign-in", {
          oauth_query: oauthQuery,
          callbackURL: "https://nativenotes.app/app",
        })
      ).headers.get("location"),
    ).toContain("/oauth/consent?");
  });
  it("preserves a signed query on GET and POST and ignores unrelated query noise", async () => {
    const response = await post(
      `/sign-in?oauth_query=${encodeURIComponent(oauthQuery)}`,
    );
    expect(response.headers.get("location")).toContain("/oauth2/authorize?");
    expect((await forwardedBody()).oauth_query).toBe(oauthQuery);
    const page = await fetch(`${base}/sign-in?campaign=test`);
    expect(await page.text()).not.toContain('value="campaign=test"');
  });
  it("keeps errors on sign-in without redirecting or losing intent", async () => {
    handler.mockResolvedValue(
      Response.json(
        { message: "Invalid credentials", url: "https://evil.example" },
        { status: 401 },
      ),
    );
    const response = await post("/sign-in", { oauth_query: oauthQuery });
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("Invalid credentials");
  });
});
describe("Google sign-in intent through the HTTP route", () => {
  it.each([
    [{}, "/app"],
    [
      { callbackURL: "https://nativenotes.app/app" },
      "https://nativenotes.app/app",
    ],
    [{ callbackURL: "https://evil.example" }, "/app"],
    [
      { oauth_query: oauthQuery, callbackURL: "https://nativenotes.app/app" },
      `https://nativenotes.app/api/auth/oauth2/authorize?${oauthQuery}`,
    ],
  ])("preserves intent %j into Better Auth state", async (fields, expected) => {
    handler.mockResolvedValue(
      Response.json({
        redirect: true,
        url: "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
      }),
    );
    const response = await post("/sign-in/google", fields);
    expect(response.headers.get("location")).toContain(
      "https://accounts.google.com/",
    );
    const payload = await forwardedBody();
    expect(payload.callbackURL).toBe(expected);
    expect(payload.oauth_query).toBe(
      "oauth_query" in fields ? fields.oauth_query : undefined,
    );
    expect(payload.provider).toBe("google");
    const request = handler.mock.calls[0]![0] as Request;
    expect(request.url).toBe("https://nativenotes.app/api/auth/sign-in/social");
    expect(request.headers.get("origin")).toBe("https://nativenotes.app");
  });
});
