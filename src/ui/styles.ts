/** Shared NativeNotes auth surface styles (minimal, monochrome). */
export const AUTH_STYLES = /* css */ `
:root {
  color-scheme: light;
  --nn-bg: #fafafa;
  --nn-fg: #0a0a0a;
  --nn-muted: #737373;
  --nn-border: #e5e5e5;
  --nn-surface: #ffffff;
  --nn-surface-hover: #f5f5f5;
  --nn-focus: #0a0a0a;
  --nn-danger: #b91c1c;
  --nn-danger-bg: #fef2f2;
  --nn-danger-border: #fecaca;
  --nn-radius: 8px;
  --nn-radius-sm: 6px;
  --nn-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
  --nn-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --nn-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --nn-space-1: 0.25rem;
  --nn-space-2: 0.5rem;
  --nn-space-3: 0.75rem;
  --nn-space-4: 1rem;
  --nn-space-5: 1.25rem;
  --nn-space-6: 1.5rem;
  --nn-space-8: 2rem;
  --nn-space-10: 2.5rem;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  min-height: 100%;
  background: var(--nn-bg);
  color: var(--nn-fg);
  font-family: var(--nn-font);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--nn-fg);
  text-underline-offset: 3px;
}

a:hover { opacity: 0.75; }

:focus-visible {
  outline: 2px solid var(--nn-focus);
  outline-offset: 2px;
}

.nn-shell {
  min-height: calc(100svh - 64px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--nn-space-6);
}

.nn-shell--top {
  justify-content: flex-start;
  padding-top: var(--nn-space-10);
}

.nn-card {
  width: 100%;
  max-width: 420px;
  background: var(--nn-surface);
  border: 1px solid var(--nn-border);
  border-radius: var(--nn-radius);
  box-shadow: var(--nn-shadow);
  padding: var(--nn-space-8) var(--nn-space-6);
}

.nn-card--wide {
  max-width: 480px;
}

.nn-brand {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 var(--nn-space-2);
}

.nn-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #292622;
  font-weight: 600;
  letter-spacing: -0.025em;
}

.nn-logo img { display: block; flex-shrink: 0; }

.nn-brand-footer {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: center;
  padding: 16px 24px;
  font-size: 12px;
}

.nn-brand-footer .nn-logo { gap: 7px; color: var(--nn-muted); font-weight: 500; }
.nn-brand-footer img { width: 18px; height: 18px; }

.nn-title {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  margin: 0 0 var(--nn-space-2);
  line-height: 1.3;
}

.nn-subtitle {
  color: var(--nn-muted);
  margin: 0 0 var(--nn-space-6);
  font-size: 0.9375rem;
}

.nn-stack {
  display: flex;
  flex-direction: column;
  gap: var(--nn-space-4);
}

.nn-field {
  display: flex;
  flex-direction: column;
  gap: var(--nn-space-2);
}

.nn-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--nn-fg);
}

.nn-hint {
  font-size: 0.8125rem;
  color: var(--nn-muted);
  margin: 0;
}

.nn-input,
.nn-select {
  width: 100%;
  appearance: none;
  background: var(--nn-surface);
  color: var(--nn-fg);
  border: 1px solid var(--nn-border);
  border-radius: var(--nn-radius-sm);
  padding: 0.625rem 0.75rem;
  font: inherit;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.nn-input:hover,
.nn-select:hover {
  background: var(--nn-surface-hover);
}

.nn-input::placeholder {
  color: var(--nn-muted);
}

.nn-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23737373' stroke-width='1.5'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.25rem;
}

.nn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--nn-space-2);
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--nn-radius-sm);
  padding: 0.65rem 1rem;
  font: inherit;
  font-weight: 500;
  font-size: 0.9375rem;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
}

.nn-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.nn-btn--primary {
  background: var(--nn-fg);
  color: var(--nn-surface);
}

.nn-btn--primary:hover:not(:disabled) {
  opacity: 0.9;
}

.nn-btn--secondary {
  background: var(--nn-surface);
  color: var(--nn-fg);
  border-color: var(--nn-border);
}

.nn-btn--secondary:hover:not(:disabled) {
  background: var(--nn-surface-hover);
}

.nn-btn--ghost {
  background: transparent;
  color: var(--nn-muted);
  border-color: transparent;
}

.nn-btn--ghost:hover:not(:disabled) {
  color: var(--nn-fg);
  background: var(--nn-surface-hover);
}

.nn-btn--danger {
  background: var(--nn-surface);
  color: var(--nn-danger);
  border-color: var(--nn-danger-border);
}

.nn-btn--danger:hover:not(:disabled) {
  background: var(--nn-danger-bg);
}

.nn-separator {
  display: flex;
  align-items: center;
  gap: var(--nn-space-3);
  color: var(--nn-muted);
  font-size: 0.8125rem;
  margin: var(--nn-space-2) 0;
}

.nn-separator::before,
.nn-separator::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--nn-border);
}

.nn-alert {
  border: 1px solid var(--nn-border);
  border-radius: var(--nn-radius-sm);
  padding: var(--nn-space-3) var(--nn-space-4);
  font-size: 0.875rem;
  margin: 0 0 var(--nn-space-4);
}

.nn-alert--error {
  border-color: var(--nn-danger-border);
  background: var(--nn-danger-bg);
  color: var(--nn-danger);
}

.nn-alert--info {
  background: var(--nn-surface-hover);
  color: var(--nn-fg);
}

.nn-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--nn-border);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.75rem;
  color: var(--nn-muted);
  background: var(--nn-surface);
}

.nn-scope-list {
  list-style: none;
  margin: 0 0 var(--nn-space-5);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--nn-space-2);
}

.nn-scope-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--nn-space-3);
  font-size: 0.9375rem;
}

.nn-scope-list li::before {
  content: "";
  width: 0.4rem;
  height: 0.4rem;
  margin-top: 0.45rem;
  border-radius: 999px;
  background: var(--nn-fg);
  flex-shrink: 0;
}

.nn-scope-detail {
  margin-top: var(--nn-space-2);
}

.nn-scope-detail summary {
  cursor: pointer;
  color: var(--nn-muted);
  font-size: 0.8125rem;
}

.nn-scope-detail code {
  font-family: var(--nn-mono);
  font-size: 0.75rem;
  color: var(--nn-muted);
}

.nn-footer {
  margin-top: var(--nn-space-6);
  text-align: center;
  color: var(--nn-muted);
  font-size: 0.875rem;
}

.nn-footer a { font-weight: 500; }

.nn-actions {
  display: flex;
  flex-direction: column;
  gap: var(--nn-space-3);
  margin-top: var(--nn-space-2);
}

.nn-actions--row {
  flex-direction: row;
}

.nn-actions--row .nn-btn {
  width: auto;
  flex: 1;
}

.nn-security {
  margin: var(--nn-space-5) 0 0;
  padding-top: var(--nn-space-4);
  border-top: 1px solid var(--nn-border);
  font-size: 0.8125rem;
  color: var(--nn-muted);
}

.nn-org-option-meta {
  color: var(--nn-muted);
  font-size: 0.8125rem;
}

.nn-google-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

@media (max-width: 480px) {
  .nn-shell { padding: var(--nn-space-4); }
  .nn-card { padding: var(--nn-space-6) var(--nn-space-4); }
  .nn-actions--row { flex-direction: column; }
  .nn-actions--row .nn-btn { width: 100%; }
}
`;
