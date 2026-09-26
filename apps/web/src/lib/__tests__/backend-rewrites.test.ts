import { describe, expect, test } from "vitest";

import {
  BACKEND_REWRITE_SOURCES,
  buildBackendRewrites,
  validateBackendOrigin,
} from "@/lib/backend-rewrites";
import { getNativeNotesApiUrl, getSignInUrl } from "@/lib/config";

describe("backend rewrites", () => {
  test("builds explicit path proxies without a catch-all", () => {
    const rewrites = buildBackendRewrites("https://nativenotes.vercel.app");
    expect(rewrites).toEqual([
      {
        source: "/api/auth/:path*",
        destination: "https://nativenotes.vercel.app/api/auth/:path*",
      },
      {
        source: "/api/notes",
        destination: "https://nativenotes.vercel.app/api/notes",
      },
      {
        source: "/api/notes/:path*",
        destination: "https://nativenotes.vercel.app/api/notes/:path*",
      },
      {
        source: "/.well-known/:path*",
        destination: "https://nativenotes.vercel.app/.well-known/:path*",
      },
      {
        source: "/mcp",
        destination: "https://nativenotes.vercel.app/mcp",
      },
      {
        source: "/oauth/consent",
        destination: "https://nativenotes.vercel.app/oauth/consent",
      },
      {
        source: "/sign-in",
        destination: "https://nativenotes.vercel.app/sign-in",
      },
      {
        source: "/sign-up",
        destination: "https://nativenotes.vercel.app/sign-up",
      },
      {
        source: "/sign-in/google",
        destination: "https://nativenotes.vercel.app/sign-in/google",
      },
      {
        source: "/health",
        destination: "https://nativenotes.vercel.app/health",
      },
    ]);
    expect(
      BACKEND_REWRITE_SOURCES.some((s) => s.includes("*") && s === "/*"),
    ).toBe(false);
    expect(rewrites.every((r) => !r.source.startsWith("/app"))).toBe(true);
  });

  test("rejects public app domain and non-https production origins", () => {
    expect(() =>
      validateBackendOrigin("https://nativenotes.app", {
        requireProductionHttps: true,
      }),
    ).toThrow(/rewrite loop/);
    expect(() =>
      validateBackendOrigin("http://nativenotes.vercel.app", {
        requireProductionHttps: true,
      }),
    ).toThrow(/https/);
    expect(
      validateBackendOrigin("https://nativenotes.vercel.app", {
        requireProductionHttps: true,
      }),
    ).toBe("https://nativenotes.vercel.app");
  });
});

describe("config", () => {
  test("defaults api url and sign-in callback for local dual-port", () => {
    expect(getNativeNotesApiUrl()).toMatch(/localhost:3000/);
    // In jsdom, getWebOrigin() prefers window.location.origin; SSR/dev
    // fallback remains localhost:3001 when window is absent.
    expect(getSignInUrl("/app")).toContain("/sign-in");
    expect(getSignInUrl("/app")).toContain("callbackURL=");
    expect(getSignInUrl("/app")).toContain("%2Fapp");
  });
});

describe("rewrite origin validation", () => {
  test.each([
    "https://www.nativenotes.app",
    "https://user:pass@backend.example",
    "https://backend.example/path",
    "https://backend.example?x=1",
    "https://backend.example#x",
    "ftp://localhost",
    "file://localhost",
    "//backend.example",
    "",
  ])("rejects invalid or looping origin %s", (origin) => {
    expect(() => validateBackendOrigin(origin)).toThrow();
  });
  test("allows only HTTP loopback in development", () => {
    expect(validateBackendOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(() =>
      validateBackendOrigin("http://localhost:3000", {
        requireProductionHttps: true,
      }),
    ).toThrow();
  });
});
