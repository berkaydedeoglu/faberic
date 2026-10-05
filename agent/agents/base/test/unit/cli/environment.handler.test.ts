import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EnvironmentCliHandler } from "../../../src/cli/handlers/environment.handler.ts";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { createMockedEnvironmentStack, type MockGit } from "../../mocks/environment.mock.ts";

describe("EnvironmentCliHandler", () => {
  let workspace: string;
  let git: MockGit;
  let handler: EnvironmentCliHandler;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const stack = createMockedEnvironmentStack();
    ({ workspace, git, cleanup } = stack);
    handler = new EnvironmentCliHandler(stack.controller);
    await stack.service.ensureWorkspace();
  });

  afterEach(() => cleanup());

  it("clones one repository and prints its result as JSON", async () => {
    expect(JSON.parse(await handler.clone({ url: "https://example.com/repo.git", depth: 2 }))).toEqual({
      url: "https://example.com/repo.git",
      path: join(workspace, "repo"),
      status: "cloned",
    });
    expect(git.clones).toEqual([
      {
        url: "https://example.com/repo.git",
        destination: join(workspace, "repo"),
        options: { depth: 2, token: "token-for-https://example.com/repo.git" },
      },
    ]);
  });

  it("fails with the clone's error", async () => {
    git.failing.add("https://example.com/missing");
    await expect(handler.clone({ url: "https://example.com/missing" })).rejects.toThrow(
      "git clone failed with exit code 128: fatal: repository 'https://example.com/missing' not found",
    );
  });

  it("joins the content words", async () => {
    const { path } = JSON.parse(await handler.createAgentMd(["Be", "brief."], {}));
    expect(path).toBe(join(workspace, "AGENTS.md"));
    expect(await readFile(path, "utf8")).toBe("Be brief.");
  });

  it("reads the content from --file", async () => {
    const source = join(workspace, "skill-source.md");
    await writeFile(source, "---\nname: lint\n---\nRun the linter.\n");
    const { path } = JSON.parse(await handler.injectSkill("lint", [], { file: source }));
    expect(await readFile(path, "utf8")).toBe("---\nname: lint\n---\nRun the linter.\n");
  });

  it("rejects content given both ways, and no content at all", async () => {
    await expect(handler.createAgentMd(["x"], { file: "/any" })).rejects.toThrow(
      "Pass the content as arguments or with --file, not both",
    );
    await expect(handler.createAgentMd([], {})).rejects.toThrow(ValidationError);
  });

  it("fails when --file does not exist", async () => {
    await expect(handler.injectSkill("lint", [], { file: join(workspace, "missing.md") })).rejects.toThrow("ENOENT");
  });

  it("loads AGENTS.md, SYSTEM.md, and a skill from the artifacts repository and prints the paths", async () => {
    const agentMd = JSON.parse(await handler.loadAgentMd("docs/AGENTS.md"));
    expect(agentMd).toEqual({ path: join(workspace, "AGENTS.md") });
    expect(await readFile(agentMd.path, "utf8")).toBe("content-of-docs/AGENTS.md");

    const systemMd = JSON.parse(await handler.loadSystemMd("prompts/SYSTEM.md"));
    expect(systemMd).toEqual({ path: join(workspace, ".pi", "SYSTEM.md") });

    const skill = JSON.parse(await handler.loadSkill("skills/lint/SKILL.md"));
    expect(skill).toEqual({ path: join(workspace, ".pi", "skills", "lint", "SKILL.md") });
    expect(git.sparseClones.map((clone) => clone.paths)).toEqual([["docs/AGENTS.md"], ["prompts/SYSTEM.md"], ["skills/lint/SKILL.md"]]);
  });

  it("fails the load when the file is missing in the artifacts repository", async () => {
    git.missingPaths.add("docs/AGENTS.md");
    await expect(handler.loadAgentMd("docs/AGENTS.md")).rejects.toThrow('No file "docs/AGENTS.md"');
  });
});
