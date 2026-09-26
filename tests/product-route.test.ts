import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
const getSession = vi.fn();
const findOne = vi.fn();
const command = vi.fn();
vi.mock("../src/auth/auth.js", () => ({ auth: { api: { getSession }, $context: Promise.resolve({ adapter: { findOne } }) } }));
vi.mock("../src/services/product-service.js", () => ({ executeProductCommand: command }));
const { handleProductRoute } = await import("../src/server/product-route.js");
const { env } = await import("../src/config/env.js");
async function request(headers: Record<string, string> = {}, body: unknown = { command: "note.favorite", input: { id: "a", favorited: true } }) {
  const req = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  req.method = "POST"; req.url = "/api/workspace/commands";
  req.headers = { origin: new URL(env.BETTER_AUTH_URL).origin, "x-workspace-id": "org-a", ...headers };
  let status = 0; let payload = "";
  const response = { writeHead: (s: number) => { status = s; }, end: (s: string) => { payload = s; } } as unknown as ServerResponse;
  await handleProductRoute(req, response);
  return { status, data: JSON.parse(payload) };
}
beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "user-a" }, session: { activeOrganizationId: "org-a" } });
  findOne.mockResolvedValue({ id: "membership" }); command.mockResolvedValue({ ok: true });
});
describe("workspace transport authority", () => {
  it("derives authority from session and membership, ignoring tenant input", async () => {
    expect((await request({}, { command: "note.favorite", tenantId: "org-b", input: { id: "a", favorited: true, tenantId: "org-b" } })).status).toBe(200);
    expect(command).toHaveBeenCalledWith("org-a", "user-a", "note.favorite", expect.any(Object));
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: [{ field: "userId", value: "user-a" }, { field: "organizationId", value: "org-a" }] }));
  });
  it("rejects stale/missing workspace preconditions without invoking mutations", async () => {
    expect((await request({ "x-workspace-id": "org-b" })).data.error).toBe("workspace_changed");
    expect((await request({ "x-workspace-id": "" })).status).toBe(409);
    expect(command).not.toHaveBeenCalled();
  });
  it("rejects removed members, signed-out callers, and foreign origins", async () => {
    findOne.mockResolvedValue(null);
    expect((await request()).status).toBe(403);
    getSession.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect((await request({ origin: "https://evil.invalid" })).status).toBe(403);
    expect(command).not.toHaveBeenCalled();
  });
});
