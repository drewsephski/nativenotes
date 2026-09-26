import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

import { applyTrustedOriginCors } from "../src/server/cors.js";

function fakeRequest(
  headers: Record<string, string | undefined>,
  method = "GET",
): IncomingMessage {
  return { headers, method } as IncomingMessage;
}

function fakeResponse() {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader: (key: string, value: string) => {
      headers.set(key.toLowerCase(), value);
    },
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse & {
    headers: Map<string, string>;
    writeHead: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

describe("trusted origin CORS", () => {
  it("allows localhost:3001 with credentials and never uses *", () => {
    const response = fakeResponse();
    const handled = applyTrustedOriginCors(
      fakeRequest({ origin: "http://localhost:3001" }),
      response,
    );
    expect(handled).toBe(false);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3001",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
  });

  it("handles OPTIONS preflight for trusted web origin", () => {
    const response = fakeResponse();
    const handled = applyTrustedOriginCors(
      fakeRequest({ origin: "http://localhost:3001" }, "OPTIONS"),
      response,
    );
    expect(handled).toBe(true);
    expect(response.writeHead).toHaveBeenCalledWith(204);
    expect(response.end).toHaveBeenCalled();
  });

  it("ignores untrusted origins", () => {
    const response = fakeResponse();
    const handled = applyTrustedOriginCors(
      fakeRequest({ origin: "https://evil.example" }),
      response,
    );
    expect(handled).toBe(false);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
});
