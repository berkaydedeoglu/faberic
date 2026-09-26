import { describe, expect, it } from "bun:test";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { resolveInside } from "../../../src/utils/paths.ts";

describe("resolveInside", () => {
  it("resolves paths inside the root", () => {
    expect(resolveInside("/ws", ".", "dir")).toBe("/ws");
    expect(resolveInside("/ws", "repo", "dir")).toBe("/ws/repo");
    expect(resolveInside("/ws", "a/../b/./c", "dir")).toBe("/ws/b/c");
    expect(resolveInside("/ws", "..repo", "dir")).toBe("/ws/..repo");
    expect(resolveInside("/ws", "/ws/repo", "dir")).toBe("/ws/repo");
  });

  it("rejects paths that leave the root", () => {
    for (const path of ["..", "../x", "a/../../x", "/etc", "/wsx"]) {
      expect(() => resolveInside("/ws", path, "dir")).toThrow(ValidationError);
    }
    expect(() => resolveInside("/ws", "..", "dir")).toThrow('"dir" must stay inside the workspace');
  });
});
