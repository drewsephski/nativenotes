import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../src/domain/auth-context.js";
const execute = vi.fn();
vi.mock("../src/services/product-service.js", () => ({
  executeProductCommand: execute,
}));
const { executeMcpMutation, registerProductTools } =
  await import("../src/mcp/product-tools.js");
const { McpServer } = await import("@modelcontextprotocol/server");
const context: AuthContext = {
  tenantId: "grant-tenant",
  userId: "user-a",
  scopes: ["mcp:read"],
  roles: ["member"],
};
beforeEach(() => {
  vi.clearAllMocks();
  execute.mockResolvedValue({ ok: true });
});
describe("MCP product authorization", () => {
  it("rejects read-only mutations before dispatch", async () => {
    await expect(
      executeMcpMutation(context, "note.create", { title: "A", body: "" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      executeMcpMutation(context, "instructions.set", { instructions: "A" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(execute).not.toHaveBeenCalled();
  });
  it("keeps instruction and general mutation scopes separate", async () => {
    await expect(
      executeMcpMutation(
        { ...context, scopes: ["mcp:read", "mcp:write"] },
        "instructions.set",
        {},
      ),
    ).rejects.toThrow();
    await expect(
      executeMcpMutation(
        { ...context, scopes: ["mcp:read", "mcp:instructions"] },
        "note.update",
        {},
      ),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it("uses grant authority even when input claims another tenant", async () => {
    await executeMcpMutation(
      { ...context, scopes: ["mcp:read", "mcp:write"] },
      "note.favorite",
      { id: "note-a", favorited: true, tenantId: "other" },
    );
    expect(execute).toHaveBeenCalledWith(
      "grant-tenant",
      "user-a",
      "note.favorite",
      expect.any(Object),
    );
  });
  it("only advertises granted mutations and requires expectedVersion for updates", () => {
    const server = new McpServer({ name: "test", version: "1" });
    const register = vi.spyOn(server, "registerTool");
    registerProductTools(server, context);
    expect(register.mock.calls.map((c) => c[0])).toEqual([
      "note.get",
      "note.search",
      "folder.list",
      "tag.list",
      "instructions.get",
    ]);
    const writable = new McpServer({ name: "write", version: "1" });
    const writeRegister = vi.spyOn(writable, "registerTool");
    registerProductTools(writable, {
      ...context,
      scopes: ["mcp:read", "mcp:write", "mcp:instructions"],
    });
    const update = writeRegister.mock.calls.find(
      (c) => c[0] === "note.update",
    )!;
    if (!(update[1].inputSchema instanceof z.ZodObject))
      throw new Error("Expected object schema");
    expect(
      update[1].inputSchema.safeParse({ id: "a", title: "A", body: "B" })
        .success,
    ).toBe(false);
    expect(
      update[1].inputSchema.safeParse({
        id: "a",
        title: "A",
        body: "B",
        expectedVersion: 1,
      }).success,
    ).toBe(true);
    expect(writeRegister.mock.calls.map((c) => c[0])).toContain(
      "instructions.set",
    );
  });
});
