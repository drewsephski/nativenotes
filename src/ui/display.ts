const SCOPE_LABELS: Record<string, string> = {
  "mcp:read": "Read notes",
  "mcp:write": "Create and edit notes",
  "mcp:instructions": "Read and manage AI instructions",
  "mcp:admin": "Administrative memory actions",
};

const HIDDEN_SCOPES = new Set(["openid", "offline_access", "profile", "email"]);

export type HumanScope = {
  scope: string;
  label: string;
};

export function parseRequestedScopes(scopeParam: string | undefined): string[] {
  if (!scopeParam) return [];
  return scopeParam
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function humanizeScopes(scopes: string[]): HumanScope[] {
  const seen = new Set<string>();
  const result: HumanScope[] = [];
  for (const scope of scopes) {
    if (HIDDEN_SCOPES.has(scope) || seen.has(scope)) continue;
    seen.add(scope);
    result.push({
      scope,
      label: SCOPE_LABELS[scope] ?? scope,
    });
  }
  return result;
}

export function clientDisplayName(clientId: string | undefined): string {
  if (!clientId) return "an MCP client";
  try {
    const url = new URL(clientId);
    const host = url.hostname.toLowerCase();
    if (host === "chatgpt.com" || host.endsWith(".chatgpt.com")) {
      return "ChatGPT";
    }
    if (host === "claude.ai" || host.endsWith(".claude.ai")) {
      return "Claude";
    }
    return host;
  } catch {
    return clientId.length > 48 ? `${clientId.slice(0, 45)}…` : clientId;
  }
}

export function suggestedWorkspaceName(userName: string | undefined): string {
  const trimmed = userName?.trim();
  if (!trimmed) return "Personal";
  const first = trimmed.split(/\s+/)[0];
  if (!first || first.length === 0) return "Personal";
  return `${first}'s Workspace`;
}
