import { outputSchemas, toolResult } from "../src/mcp/output-schemas.js";
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
    await expect(
      executeMcpMutation(context, "note.proposeUpdate", {}),
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
  it("allows proposal-only grants without advertising or dispatching direct writes", async () => {
    const proposer = { ...context, scopes: ["mcp:read", "mcp:propose"] };
    await executeMcpMutation(proposer, "note.proposeUpdate", {});
    execute.mockClear();
    for (const name of [
      "note.update",
      "note.create",
      "note.trash",
      "instructions.set",
    ] as const)
      await expect(
        executeMcpMutation(proposer, name, {}),
      ).rejects.toMatchObject({ status: 403 });
    expect(execute).not.toHaveBeenCalled();
    const server = new McpServer({ name: "proposer", version: "1" });
    const register = vi.spyOn(server, "registerTool");
    registerProductTools(server, proposer);
    expect(register.mock.calls.map((call) => call[0])).toContain(
      "note.proposeUpdate",
    );
    expect(register.mock.calls.map((call) => call[0])).not.toContain(
      "note.update",
    );
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
      { kind: "mcp", oauthClientId: undefined },
    );
  });
  it("only advertises granted mutations and requires expectedVersion for updates", () => {
    const server = new McpServer({ name: "test", version: "1" });
    const register = vi.spyOn(server, "registerTool");
    registerProductTools(server, context);
    expect(register.mock.calls.map((c) => c[0])).toEqual([
      "proposal.get",
      "proposal.list",
      "note.get",
      "note.history",
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
    expect(writeRegister.mock.calls.map((c) => c[0])).toContain(
      "note.proposeUpdate",
    );
    expect(writeRegister.mock.calls.map((c) => c[0])).not.toContain(
      "proposal.accept",
    );
    expect(writeRegister.mock.calls.map((c) => c[0])).not.toContain(
      "proposal.reject",
    );
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

describe("MCP contracts and review policy", () => {
  it("omits direct mutation tools and rejects stale advertised calls under mandatory review", async () => {
    const reviewed = {
      ...context,
      requireReview: true,
      scopes: ["mcp:read", "mcp:write", "mcp:instructions"],
    };
    const server = new McpServer({ name: "review", version: "1" });
    const register = vi.spyOn(server, "registerTool");
    registerProductTools(server, reviewed);
    const names = register.mock.calls.map(([name]) => name);
    expect(names).toContain("note.proposeUpdate");
    expect(names).not.toContain("note.move");
    expect(names).not.toContain("instructions.set");
    await expect(
      executeMcpMutation(reviewed, "note.create", {}),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("advertises validated structured output for every tool", () => {
    const server = new McpServer({ name: "contracts", version: "1" });
    const register = vi.spyOn(server, "registerTool");
    registerProductTools(server, {
      ...context,
      scopes: ["mcp:read", "mcp:write", "mcp:instructions"],
    });
    for (const [, definition] of register.mock.calls)
      expect(definition.outputSchema).toBeInstanceOf(z.ZodObject);
    expect(register.mock.calls.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "note.move",
        "note.history",
        "tag.rename",
        "note.restoreRevision",
      ]),
    );
    const result = toolResult(outputSchemas["tag.create"], {
      id: "tag",
      name: "Tag",
      normalizedName: "tag",
      tenantId: "private",
    });
    expect(result.structuredContent).not.toHaveProperty("tenantId");
    expect(JSON.parse(result.content[0]!.text)).toEqual(
      result.structuredContent,
    );
  });
});
