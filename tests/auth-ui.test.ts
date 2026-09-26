import { describe, expect, it } from "vitest";

import {
  clientDisplayName,
  humanizeScopes,
  parseRequestedScopes,
  suggestedWorkspaceName,
} from "../src/ui/display.js";
import {
  renderConsentPage,
  renderSignInPage,
  renderSignUpPage,
} from "../src/ui/pages.js";
import { googleOAuthCallbackPath, publicOrigin } from "../src/config/env.js";
import {
  isExternalAuthRedirect,
  sanitizeOAuthQuery,
} from "../src/server/auth-forward.js";
import { trustedForwardOrigin } from "../src/server/request-origin.js";
import type { IncomingMessage } from "node:http";

function fakeRequest(
  headers: Record<string, string | undefined>,
): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe("auth display helpers", () => {
  it("maps MCP scopes to human labels and hides oidc noise", () => {
    expect(
      humanizeScopes(
        parseRequestedScopes(
          "openid offline_access mcp:read mcp:write mcp:instructions mcp:admin",
        ),
      ),
    ).toEqual([
      { scope: "mcp:read", label: "Read notes" },
      { scope: "mcp:write", label: "Create and edit notes" },
      {
        scope: "mcp:instructions",
        label: "Read and manage AI instructions",
      },
      { scope: "mcp:admin", label: "Administrative memory actions" },
    ]);
  });

  it("names known CIMD clients and suggests workspace titles", () => {
    expect(
      clientDisplayName("https://chatgpt.com/oauth/client.json"),
    ).toBe("ChatGPT");
    expect(suggestedWorkspaceName("Ada Lovelace")).toBe("Ada's Workspace");
    expect(suggestedWorkspaceName(undefined)).toBe("Personal");
  });

  it("documents the Better Auth Google callback path", () => {
    expect(googleOAuthCallbackPath).toBe("/api/auth/callback/google");
  });

  it("forwards a trusted Origin for Better Auth CSRF on server-side auth posts", () => {
    expect(
      trustedForwardOrigin(
        fakeRequest({ origin: "https://nativenotes.vercel.app" }),
      ),
    ).toBe("https://nativenotes.vercel.app");
    expect(
      trustedForwardOrigin(
        fakeRequest({
          referer: "https://nativenotes.vercel.app/sign-in?x=1",
        }),
      ),
    ).toBe("https://nativenotes.vercel.app");
    expect(trustedForwardOrigin(fakeRequest({}))).toBe(publicOrigin);
  });

  it("strips Vercel share params from oauth_query", () => {
    expect(
      sanitizeOAuthQuery(
        "_vercel_share=abc&client_id=https://chatgpt.com/oauth/client.json",
      ),
    ).toBe("client_id=https%3A%2F%2Fchatgpt.com%2Foauth%2Fclient.json");
    expect(sanitizeOAuthQuery("_vercel_share=only")).toBe("");
  });

  it("treats apex→www and relative auth Locations as non-browser redirects", () => {
    const base = "https://nativenotes.app";
    expect(
      isExternalAuthRedirect(
        "https://www.nativenotes.app/api/auth/sign-in/social",
        base,
      ),
    ).toBe(false);
    expect(
      isExternalAuthRedirect("/api/auth/sign-in/social", base),
    ).toBe(false);
    expect(
      isExternalAuthRedirect(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
        base,
      ),
    ).toBe(true);
  });
});

describe("auth UI pages", () => {
  it("renders sign-in with Google primary action and Grokbot anchors", () => {
    const html = renderSignInPage({
      oauthQuery:
        "client_id=https://chatgpt.com/oauth/client.json&scope=mcp:read",
      googleEnabled: true,
    });
    expect(html).toContain("Continue with Google");
    expect(html).toContain('data-testid="google-sign-in"');
    expect(html).toContain('data-testid="email-input"');
    expect(html).toContain('data-testid="password-input"');
    expect(html).toContain('data-testid="sign-in-submit"');
    expect(html).toContain("connect");
    expect(html).toContain("ChatGPT");
  });

  it("renders sign-up with Google and email fallback", () => {
    const html = renderSignUpPage({
      oauthQuery: "",
      googleEnabled: true,
    });
    expect(html).toContain("Create account");
    expect(html).toContain('data-testid="google-sign-in"');
    expect(html).toContain('data-testid="sign-up-submit"');
  });

  it("preserves trusted callbackURL for web app return", () => {
    const html = renderSignInPage({
      oauthQuery: "",
      googleEnabled: true,
      callbackURL: "http://localhost:3001/app",
    });
    expect(html).toContain('name="callbackURL"');
    expect(html).toContain("http://localhost:3001/app");
    expect(html).toContain("/sign-up?callbackURL=");
  });

  it("renders consent with human scopes and workspace bootstrap", () => {
    const empty = renderConsentPage({
      organizations: [],
      oauthQuery:
        "client_id=https://chatgpt.com/oauth/client.json&scope=openid mcp:read mcp:write",
      userName: "Drew",
    });
    expect(empty).toContain("ChatGPT wants to connect to NativeNotes");
    expect(empty).toContain("Read notes");
    expect(empty).toContain("Create and edit notes");
    expect(empty).toContain("Drew&#39;s Workspace");
    expect(empty).toContain('data-testid="create-workspace"');
    expect(empty).toContain(
      "This connection will only have access to the selected workspace.",
    );
    expect(empty).not.toContain("referenceId");

    const withOrgs = renderConsentPage({
      organizations: [
        { id: "org-a", name: "Organization A", slug: "org-a" },
        { id: "org-b", name: "Organization B", slug: "org-b" },
      ],
      oauthQuery:
        "client_id=https://chatgpt.com/oauth/client.json&scope=mcp:read",
      selectedOrganizationId: "org-a",
    });
    expect(withOrgs).toContain('data-testid="organization-select"');
    expect(withOrgs).toContain('data-testid="consent-approve"');
    expect(withOrgs).toContain('data-testid="consent-deny"');
    expect(withOrgs).toContain("Organization A");
  });
});
