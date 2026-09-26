import { describe, expect, test } from "vitest";
import {
  slugifyWorkspaceName,
  suggestedWorkspaceName,
  userInitials,
} from "@/lib/workspace";

describe("workspace helpers", () => {
  test("slugifies names", () => {
    expect(slugifyWorkspaceName("Ada's Workspace")).toBe("adas-workspace");
    expect(slugifyWorkspaceName("  Hello World!  ")).toBe("hello-world");
  });

  test("suggests default workspace names", () => {
    expect(suggestedWorkspaceName("Ada Lovelace")).toBe("Ada's Workspace");
    expect(suggestedWorkspaceName(undefined)).toBe("Personal");
  });

  test("builds initials", () => {
    expect(userInitials("Ada Lovelace", "ada@example.com")).toBe("AL");
    expect(userInitials(undefined, "ada@example.com")).toBe("AD");
  });
});
