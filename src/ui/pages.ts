import {
  alertHtml,
  escapeHtml,
  googleIconSvg,
  hiddenCallbackURL,
  hiddenOAuthQuery,
  renderDocument,
} from "./html.js";
import {
  clientDisplayName,
  humanizeScopes,
  parseRequestedScopes,
  suggestedWorkspaceName,
} from "./display.js";

export type AuthPageMessage = {
  tone?: "error" | "info";
  text: string;
};

export type OrganizationOption = {
  id: string;
  name: string;
  slug?: string | null;
};

function oauthContextBanner(oauthQuery: string): string {
  if (!oauthQuery) return "";
  let clientId: string | undefined;
  try {
    clientId = new URLSearchParams(oauthQuery).get("client_id") ?? undefined;
  } catch {
    clientId = undefined;
  }
  const name = clientDisplayName(clientId);
  return `<div class="nn-alert nn-alert--info" role="status">Continue signing in to connect <strong>${escapeHtml(name)}</strong> to NativeNotes.</div>`;
}

function googleButton(input: {
  oauthQuery: string;
  callbackURL?: string;
  enabled: boolean;
  label: string;
}): string {
  if (!input.enabled) {
    return `<p class="nn-hint">Google sign-in is not configured on this deployment.</p>`;
  }
  return `<form method="post" action="/sign-in/google" class="nn-stack">
${hiddenOAuthQuery(input.oauthQuery)}
${hiddenCallbackURL(input.callbackURL)}
<button type="submit" class="nn-btn nn-btn--secondary" data-testid="google-sign-in" aria-label="${escapeHtml(input.label)}">
${googleIconSvg()}
<span>${escapeHtml(input.label)}</span>
</button>
</form>`;
}

export function renderSignInPage(input: {
  oauthQuery: string;
  googleEnabled: boolean;
  callbackURL?: string;
  message?: AuthPageMessage;
}): string {
  const messageHtml = input.message
    ? alertHtml(input.message.text, input.message.tone ?? "error")
    : "";
  const signUpParams = new URLSearchParams();
  if (input.oauthQuery) {
    new URLSearchParams(input.oauthQuery).forEach((value, key) => {
      signUpParams.set(key, value);
    });
  }
  if (input.callbackURL) signUpParams.set("callbackURL", input.callbackURL);
  const signUpQuery = signUpParams.toString();
  const signUpHref = signUpQuery ? `/sign-up?${signUpQuery}` : "/sign-up";

  const body = `<main class="nn-shell">
<section class="nn-card" aria-labelledby="sign-in-title">
<p class="nn-brand">NativeNotes</p>
<h1 class="nn-title" id="sign-in-title">Sign in</h1>
<p class="nn-subtitle">Secure access for your notes and MCP connections.</p>
${oauthContextBanner(input.oauthQuery)}
${messageHtml}
${googleButton({
    oauthQuery: input.oauthQuery,
    callbackURL: input.callbackURL,
    enabled: input.googleEnabled,
    label: "Continue with Google",
  })}
<div class="nn-separator" role="separator" aria-label="or">or</div>
<form method="post" action="/sign-in" class="nn-stack" novalidate>
${hiddenOAuthQuery(input.oauthQuery)}
${hiddenCallbackURL(input.callbackURL)}
<div class="nn-field">
<label class="nn-label" for="email">Email</label>
<input class="nn-input" id="email" name="email" type="email" required autocomplete="username" data-testid="email-input" aria-required="true">
</div>
<div class="nn-field">
<label class="nn-label" for="password">Password</label>
<input class="nn-input" id="password" name="password" type="password" required autocomplete="current-password" data-testid="password-input" aria-required="true">
</div>
<button type="submit" class="nn-btn nn-btn--primary" data-testid="sign-in-submit">Sign in with email</button>
</form>
<p class="nn-footer">No account? <a href="${escapeHtml(signUpHref)}">Create one</a></p>
</section>
</main>`;

  return renderDocument({
    title: "Sign in · NativeNotes",
    description: "Sign in to NativeNotes",
    body,
  });
}

export function renderSignUpPage(input: {
  oauthQuery: string;
  googleEnabled: boolean;
  callbackURL?: string;
  message?: AuthPageMessage;
}): string {
  const messageHtml = input.message
    ? alertHtml(input.message.text, input.message.tone ?? "error")
    : "";
  const signInParams = new URLSearchParams();
  if (input.oauthQuery) {
    new URLSearchParams(input.oauthQuery).forEach((value, key) => {
      signInParams.set(key, value);
    });
  }
  if (input.callbackURL) signInParams.set("callbackURL", input.callbackURL);
  const signInQuery = signInParams.toString();
  const signInHref = signInQuery ? `/sign-in?${signInQuery}` : "/sign-in";

  const body = `<main class="nn-shell">
<section class="nn-card" aria-labelledby="sign-up-title">
<p class="nn-brand">NativeNotes</p>
<h1 class="nn-title" id="sign-up-title">Create account</h1>
<p class="nn-subtitle">Start with Google, or use email and password.</p>
${oauthContextBanner(input.oauthQuery)}
${messageHtml}
${googleButton({
    oauthQuery: input.oauthQuery,
    callbackURL: input.callbackURL,
    enabled: input.googleEnabled,
    label: "Continue with Google",
  })}
<div class="nn-separator" role="separator" aria-label="or">or</div>
<form method="post" action="/sign-up" class="nn-stack" novalidate>
${hiddenOAuthQuery(input.oauthQuery)}
${hiddenCallbackURL(input.callbackURL)}
<div class="nn-field">
<label class="nn-label" for="name">Name</label>
<input class="nn-input" id="name" name="name" type="text" required autocomplete="name" data-testid="name-input" aria-required="true">
</div>
<div class="nn-field">
<label class="nn-label" for="email">Email</label>
<input class="nn-input" id="email" name="email" type="email" required autocomplete="username" data-testid="email-input" aria-required="true">
</div>
<div class="nn-field">
<label class="nn-label" for="password">Password</label>
<input class="nn-input" id="password" name="password" type="password" required autocomplete="new-password" minlength="8" data-testid="password-input" aria-required="true">
<p class="nn-hint">At least 8 characters.</p>
</div>
<button type="submit" class="nn-btn nn-btn--primary" data-testid="sign-up-submit">Create account</button>
</form>
<p class="nn-footer">Already have an account? <a href="${escapeHtml(signInHref)}">Sign in</a></p>
</section>
</main>`;

  return renderDocument({
    title: "Sign up · NativeNotes",
    description: "Create a NativeNotes account",
    body,
  });
}

export function renderHomePage(): string {
  const body = `<main class="nn-shell">
<section class="nn-card" aria-labelledby="home-title">
<p class="nn-brand">NativeNotes</p>
<h1 class="nn-title" id="home-title">Notes for MCP agents</h1>
<p class="nn-subtitle">Sign in to manage workspace access for ChatGPT and other MCP clients.</p>
<div class="nn-actions">
<a class="nn-btn nn-btn--primary" href="/sign-in">Sign in</a>
<a class="nn-btn nn-btn--secondary" href="/sign-up">Create account</a>
</div>
</section>
</main>`;
  return renderDocument({
    title: "NativeNotes",
    description: "NativeNotes MCP notes service",
    body,
  });
}

export function renderConsentPage(input: {
  organizations: OrganizationOption[];
  oauthQuery: string;
  userName?: string;
  message?: AuthPageMessage;
  selectedOrganizationId?: string;
}): string {
  let clientId: string | undefined;
  let scopeParam: string | undefined;
  try {
    const params = new URLSearchParams(input.oauthQuery);
    clientId = params.get("client_id") ?? undefined;
    scopeParam = params.get("scope") ?? undefined;
  } catch {
    clientId = undefined;
    scopeParam = undefined;
  }

  const clientName = clientDisplayName(clientId);
  const scopes = humanizeScopes(parseRequestedScopes(scopeParam));
  const messageHtml = input.message
    ? alertHtml(input.message.text, input.message.tone ?? "info")
    : "";

  const scopeList =
    scopes.length > 0
      ? `<ul class="nn-scope-list" aria-label="Requested access">${scopes
        .map(
          (scope) =>
            `<li><span>${escapeHtml(scope.label)}</span></li>`,
        )
        .join("")}</ul>
<details class="nn-scope-detail">
<summary>Technical scope details</summary>
<p><code>${escapeHtml(scopes.map((scope) => scope.scope).join(" "))}</code></p>
</details>`
      : `<p class="nn-hint">No additional scopes were requested beyond basic connection.</p>`;

  if (input.organizations.length === 0) {
    const suggested = suggestedWorkspaceName(input.userName);
    const body = `<main class="nn-shell nn-shell--top">
<section class="nn-card nn-card--wide" aria-labelledby="consent-title">
<p class="nn-brand">NativeNotes</p>
<h1 class="nn-title" id="consent-title">${escapeHtml(clientName)} wants to connect to NativeNotes</h1>
<p class="nn-subtitle">Create a workspace to bind this connection. Access stays limited to the workspace you choose.</p>
${messageHtml}
${scopeList}
<form method="post" action="/oauth/consent" class="nn-stack">
<input type="hidden" name="action" value="create_organization">
${hiddenOAuthQuery(input.oauthQuery)}
<div class="nn-field">
<label class="nn-label" for="organization_name">Workspace name</label>
<input class="nn-input" id="organization_name" name="organization_name" type="text" required maxlength="80" value="${escapeHtml(suggested)}" data-testid="create-workspace" aria-required="true">
</div>
<div class="nn-actions nn-actions--row">
<button type="submit" class="nn-btn nn-btn--primary">Create workspace</button>
<button type="submit" class="nn-btn nn-btn--ghost" form="deny-form" data-testid="consent-deny">Cancel</button>
</div>
</form>
<form id="deny-form" method="post" action="/oauth/consent">
<input type="hidden" name="action" value="deny">
${hiddenOAuthQuery(input.oauthQuery)}
<input type="hidden" name="accept" value="false">
</form>
<p class="nn-security">This connection will only have access to the selected workspace.</p>
</section>
</main>`;
    return renderDocument({
      title: "Approve access · NativeNotes",
      body,
    });
  }

  const options = input.organizations
    .map((organization) => {
      const selected =
        organization.id === input.selectedOrganizationId ? " selected" : "";
      const slug =
        organization.slug && organization.slug.length > 0
          ? ` (${organization.slug})`
          : "";
      return `<option value="${escapeHtml(organization.id)}"${selected}>${escapeHtml(organization.name)}${escapeHtml(slug)}</option>`;
    })
    .join("");

  const body = `<main class="nn-shell nn-shell--top">
<section class="nn-card nn-card--wide" aria-labelledby="consent-title">
<p class="nn-brand">NativeNotes</p>
<h1 class="nn-title" id="consent-title">${escapeHtml(clientName)} wants to connect to NativeNotes</h1>
<p class="nn-subtitle">Choose the workspace this connection can access.</p>
${messageHtml}
${scopeList}
<form method="post" action="/oauth/consent" class="nn-stack">
<input type="hidden" name="action" value="approve">
${hiddenOAuthQuery(input.oauthQuery)}
<input type="hidden" name="accept" value="true">
<div class="nn-field">
<label class="nn-label" for="organization_id">Workspace</label>
<select class="nn-select" id="organization_id" name="organization_id" required data-testid="organization-select" aria-required="true">
${options}
</select>
</div>
<div class="nn-actions nn-actions--row">
<button type="submit" class="nn-btn nn-btn--primary" data-testid="consent-approve">Approve</button>
<button type="submit" class="nn-btn nn-btn--ghost" form="deny-form" data-testid="consent-deny">Deny</button>
</div>
</form>
<form id="deny-form" method="post" action="/oauth/consent">
<input type="hidden" name="action" value="deny">
${hiddenOAuthQuery(input.oauthQuery)}
<input type="hidden" name="accept" value="false">
</form>
<details class="nn-scope-detail" style="margin-top:1.25rem">
<summary>Create another workspace</summary>
<form method="post" action="/oauth/consent" class="nn-stack" style="margin-top:0.75rem">
<input type="hidden" name="action" value="create_organization">
${hiddenOAuthQuery(input.oauthQuery)}
<div class="nn-field">
<label class="nn-label" for="organization_name">Workspace name</label>
<input class="nn-input" id="organization_name" name="organization_name" type="text" required maxlength="80" placeholder="Personal" data-testid="create-workspace">
</div>
<button type="submit" class="nn-btn nn-btn--secondary">Create workspace</button>
</form>
</details>
<p class="nn-security">This connection will only have access to the selected workspace.</p>
</section>
</main>`;

  return renderDocument({
    title: "Approve access · NativeNotes",
    body,
  });
}

export function renderSimpleStatusPage(input: {
  title: string;
  message: string;
  statusTone?: "error" | "info";
}): string {
  const body = `<main class="nn-shell">
<section class="nn-card" aria-labelledby="status-title">
<p class="nn-brand">NativeNotes</p>
<h1 class="nn-title" id="status-title">${escapeHtml(input.title)}</h1>
${alertHtml(input.message, input.statusTone ?? "info")}
<p class="nn-footer"><a href="/sign-in">Back to sign in</a></p>
</section>
</main>`;
  return renderDocument({ title: `${input.title} · NativeNotes`, body });
}
