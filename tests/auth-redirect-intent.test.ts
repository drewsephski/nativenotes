import { describe, expect, it } from "vitest";

import {
  DEFAULT_POST_LOGIN_PATH,
  resolvePostLoginIntent,
  resolvePostLoginLocation,
  resolveSocialCallbackURL,
  sanitizeTrustedCallbackURL,
} from "../src/server/auth-redirect-intent.js";

const trusted = [
  "https://nativenotes.app",
  "http://localhost:3001",
  "http://localhost:3000",
];
const betterAuthUrl = "https://nativenotes.app";

describe("auth redirect intent", () => {
  it("oauth_query only → OAuth authorize flow", () => {
    const intent = resolvePostLoginIntent({
      oauthQuery:
        "client_id=https://chatgpt.com/oauth/client.json&scope=mcp:read",
      betterAuthUrl,
      trustedOrigins: trusted,
    });
    expect(intent.kind).toBe("oauth");
    expect(intent.location).toContain("/api/auth/oauth2/authorize?");
    expect(intent.location).toContain("client_id=");
    expect(intent.location).not.toContain("/app");
  });

  it("trusted callbackURL only → callbackURL", () => {
    const location = resolvePostLoginLocation({
      callbackURL: "https://nativenotes.app/app",
      betterAuthUrl,
      trustedOrigins: trusted,
    });
    expect(location).toBe("https://nativenotes.app/app");
  });

  it("neither → /app", () => {
    const intent = resolvePostLoginIntent({
      betterAuthUrl,
      trustedOrigins: trusted,
    });
    expect(intent).toEqual({
      kind: "default",
      location: DEFAULT_POST_LOGIN_PATH,
    });
    expect(intent.location).toBe("/app");
    expect(intent.location).not.toBe("/");
  });

  it("both oauth_query and callbackURL → OAuth wins", () => {
    const intent = resolvePostLoginIntent({
      oauthQuery: "client_id=https://chatgpt.com/oauth/client.json&scope=openid",
      callbackURL: "https://nativenotes.app/app",
      betterAuthUrl,
      trustedOrigins: trusted,
    });
    expect(intent.kind).toBe("oauth");
    expect(intent.location).toContain("/api/auth/oauth2/authorize?");
  });

  it("untrusted callbackURL → /app", () => {
    expect(
      sanitizeTrustedCallbackURL("https://evil.example/phish", trusted),
    ).toBeUndefined();
    expect(
      resolvePostLoginLocation({
        callbackURL: "https://evil.example/phish",
        betterAuthUrl,
        trustedOrigins: trusted,
      }),
    ).toBe("/app");
  });

  it("Google social callback with oauth_query prefers OAuth safety net /app", () => {
    expect(
      resolveSocialCallbackURL({
        oauthQuery:
          "client_id=https://chatgpt.com/oauth/client.json&scope=mcp:read",
        callbackURL: "https://nativenotes.app/app",
        trustedOrigins: trusted,
      }),
    ).toBe("/app");
  });

  it("Google social without callback defaults to /app (never /)", () => {
    expect(
      resolveSocialCallbackURL({
        trustedOrigins: trusted,
      }),
    ).toBe("/app");
    expect(
      resolveSocialCallbackURL({
        callbackURL: "https://evil.example/",
        trustedOrigins: trusted,
      }),
    ).toBe("/app");
  });

  it("Google social with trusted callbackURL uses it", () => {
    expect(
      resolveSocialCallbackURL({
        callbackURL: "https://nativenotes.app/app",
        trustedOrigins: trusted,
      }),
    ).toBe("https://nativenotes.app/app");
  });
});
