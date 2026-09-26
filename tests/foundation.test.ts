import { describe, expect, it } from "vitest";

import {
  getSelectedOrganization,
  withSelectedOrganization,
} from "../src/auth/consent-selection.js";
import { organizationConsentReferenceId } from "../src/auth/grant-binding.js";
import { tenantClaim, tenantRoleClaim } from "../src/config/env.js";
import { buildAuthContext } from "../src/mcp/tenant-auth.js";
import { listNotes } from "../src/services/note-service.js";
import {
  stableGrantIdentifier,
  type GrantBindingInput,
} from "../src/repositories/oauth-grant-tenant-repository.js";
import type { NoteRepository } from "../src/repositories/note-repository.js";

const grant: GrantBindingInput = {
  userId: "user-a",
  oauthClientId: "client-1",
  organizationId: "org-a",
  resource: "http://localhost:3000/mcp",
  scopes: ["mcp:read", "offline_access"],
};

describe("grant binding", () => {
  it("derives a stable identifier from the full grant boundary", () => {
    expect(stableGrantIdentifier(grant)).toBe(
      stableGrantIdentifier({ ...grant, scopes: [...grant.scopes].reverse() }),
    );
    expect(stableGrantIdentifier(grant)).not.toBe(
      stableGrantIdentifier({ ...grant, organizationId: "org-b" }),
    );
    expect(stableGrantIdentifier(grant)).not.toBe(
      stableGrantIdentifier({ ...grant, oauthClientId: "client-2" }),
    );
  });

  it("uses the explicitly selected organization and rechecks membership", async () => {
    const adapter = {
      findOne: async <T>() =>
        ({
          id: "member-a",
          userId: "user-a",
          organizationId: "org-a",
          role: "owner",
        }) as T,
    };

    await withSelectedOrganization("org-a", async () => {
      expect(getSelectedOrganization()).toBe("org-a");
      await expect(
        organizationConsentReferenceId({
          user: { id: "user-a" },
          scopes: ["mcp:read"],
          adapter,
        }),
      ).resolves.toBe("org-a");
    });
    expect(getSelectedOrganization()).toBeUndefined();
  });
});

describe("tenant auth context", () => {
  it("accepts a bound tenant only while membership exists", async () => {
    let memberExists = true;
    const adapter = {
      findOne: async <T>() =>
        memberExists
          ? ({
              id: "member-a",
              userId: "user-a",
              organizationId: "org-a",
              role: "member",
            } as T)
          : null,
    };
    const payload = {
      sub: "user-a",
      scope: "mcp:read",
      [tenantClaim]: "org-a",
      [tenantRoleClaim]: "member",
    };

    await expect(buildAuthContext(payload, adapter)).resolves.toMatchObject({
      userId: "user-a",
      tenantId: "org-a",
      scopes: ["mcp:read"],
    });
    memberExists = false;
    await expect(buildAuthContext(payload, adapter)).rejects.toThrow(
      "Organization membership is no longer active",
    );
  });
});

describe("note.list tenant scope", () => {
  it("returns only records from the verified tenant", async () => {
    const repository: NoteRepository = {
      async listByTenant(tenantId) {
        return [
          {
            id: tenantId === "org-a" ? "note-a" : "note-b",
            tenantId,
            title: "Scoped note",
            body: "body",
            version: 1,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ];
      },
      async create() {
        throw new Error("create should not be called");
      },
      async update() {
        throw new Error("update should not be called");
      },
      async findByTenantAndId() {
        return null;
      },
    };

    await expect(
      listNotes(
        {
          userId: "user-a",
          tenantId: "org-a",
          scopes: ["mcp:read"],
          roles: ["member"],
        },
        repository,
      ),
    ).resolves.toEqual({
      notes: [
        {
          id: "note-a",
          title: "Scoped note",
          body: "body",
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
  });
});
