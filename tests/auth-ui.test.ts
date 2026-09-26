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
import { googleOAuthCallbackPath } from "../src/config/env.js";

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
