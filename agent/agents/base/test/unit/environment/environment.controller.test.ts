import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import type { EnvironmentController } from "../../../src/controllers/environment.controller.ts";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { createMockedEnvironmentStack, type MockGit } from "../../mocks/environment.mock.ts";
import type { RecordingObserver } from "../../mocks/session-sdk.mock.ts";

describe("EnvironmentController", () => {
  let workspace: string;
  let git: MockGit;
  let observer: RecordingObserver;
  let controller: EnvironmentController;
  let cleanup: () => Promise<void>;

  beforeEach(() => {
    ({ workspace, git, observer, controller, cleanup } = createMockedEnvironmentStack());
  });

  afterEach(() => cleanup());

  it("ensures the workspace", async () => {
    expect(await controller.ensureWorkspace()).toBe(workspace);
  });

  it("clones every repository of the list from validated input", async () => {
    const results = await controller.cloneRepositories({
      repositories: [
        { url: "https://example.com/repo.git", directory: "app", depth: 5 },
        { url: "https://example.com/other.git" },
      ],
    });
    expect(results).toEqual([
      { url: "https://example.com/repo.git", path: join(workspace, "app"), status: "cloned" },
      { url: "https://example.com/other.git", path: join(workspace, "other"), status: "cloned" },
    ]);
    expect(git.clones.find((clone) => clone.url === "https://example.com/repo.git")!.options.depth).toBe(5);
  });

  it("names the offending entry when a repository is invalid", async () => {
    await expect(
      controller.cloneRepositories({ repositories: [{ url: "https://example.com/a" }, { url: "https://example.com/b", depth: 0 }] }),
    ).rejects.toThrow('"repositories[1].depth" must be a positive integer');
    await expect(controller.cloneRepositories({ repositories: ["https://example.com/a"] })).rejects.toThrow(
      '"repositories[0]" must be an object',
    );
    expect(git.clones).toEqual([]);
  });

  it("writes AGENTS.md and injects a skill from validated input", async () => {
    expect(await controller.createAgentMd({ content: "rules" })).toEqual({ path: join(workspace, "AGENTS.md") });
    expect(await controller.injectSkill({ name: "a1-b2", content: "skill" })).toEqual({
      path: join(workspace, ".pi", "skills", "a1-b2", "SKILL.md"),
    });
  });

  it("rejects invalid input before any work or event", async () => {
    const invalid = [
      controller.cloneRepositories({}),
      controller.cloneRepositories({ repositories: [] }),
      controller.cloneRepositories({ repositories: { url: "https://example.com/repo" } }),
      controller.cloneRepositories({ repositories: [{}] }),
      controller.cloneRepositories({ repositories: [{ url: "  " }] }),
      controller.cloneRepositories({ repositories: [{ url: "https://example.com/repo", directory: 42 }] }),
      controller.cloneRepositories({ repositories: [{ url: "https://example.com/repo", depth: 1.5 }] }),
      controller.cloneRepositories({ repositories: [{ url: "https://example.com/repo", depth: "1" }] }),
      controller.createAgentMd({}),
      controller.createAgentMd({ content: "" }),
      controller.injectSkill({ content: "x" }),
      controller.injectSkill({ name: "lint" }),
    ];
    for (const call of invalid) {
      await expect(call).rejects.toThrow(ValidationError);
    }
    expect(git.clones).toEqual([]);
    expect(observer.events).toEqual([]);
  });

  it("accepts only Agent Skills names", async () => {
    for (const name of ["Lint", "lint_tool", "-lint", "lint-", "lint--tool", "a/b", "..", "a".repeat(65)]) {
      await expect(controller.injectSkill({ name, content: "x" })).rejects.toThrow('"name" must be lowercase letters');
    }
    expect((await controller.injectSkill({ name: "a".repeat(64), content: "x" })).path).toContain("a".repeat(64));
  });
});
