import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArtifactDownloadService } from "../../../src/services/environment/artifact-download.service.ts";
import { ArtifactsRepositoryNotConfiguredError } from "../../../src/utils/errors/environment.errors.ts";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { createMockedEnvironmentStack, type MockGit, type MockGitTokenSource } from "../../mocks/environment.mock.ts";

describe("ArtifactDownloadService", () => {
  const url = "https://artifacts.example.com/org/artifacts.git";
  let workspace: string;
  let git: MockGit;
  let tokens: MockGitTokenSource;
  let artifacts: ArtifactDownloadService;
  let cleanup: () => Promise<void>;

  beforeEach(() => {
    ({ workspace, git, tokens, artifacts, cleanup } = createMockedEnvironmentStack());
  });

  afterEach(() => cleanup());

  it("downloads the latest version of one file to the requested destination", async () => {
    const destination = join(".pi", "skills", "lint", "SKILL.md");
    const result = await artifacts.download("skills/lint/SKILL.md", destination);
    expect(result).toEqual({ path: join(workspace, destination) });
    expect(await readFile(result.path, "utf8")).toBe("content-of-skills/lint/SKILL.md");
    expect(git.sparseClones).toHaveLength(1);
    expect(git.sparseClones[0]!.paths).toEqual(["skills/lint/SKILL.md"]);
    // depth-1 sparse clone: only the requested path of the latest commit
    expect(tokens.requested).toEqual([url]);
    expect(git.sparseClones[0]!.options.token).toBe(`token-for-${url}`);
  });

  it("creates missing parent directories of the destination", async () => {
    const { path } = await artifacts.download("docs/AGENTS.md", "deeply/nested/dir/AGENTS.md");
    expect(await readFile(path, "utf8")).toBe("content-of-docs/AGENTS.md");
  });

  it("rejects a destination outside the workspace before asking the orchestrator", async () => {
    await expect(artifacts.download("docs/AGENTS.md", "../escape.md")).rejects.toThrow(
      '"destination" must stay inside the workspace',
    );
    await expect(artifacts.download("docs/AGENTS.md", "/etc/agents.md")).rejects.toThrow(ValidationError);
    expect(git.sparseClones).toEqual([]);
    expect(tokens.requested).toEqual([]);
  });

  it("refuses to download when no artifacts repository is configured", async () => {
    const unconfigured = createMockedEnvironmentStack(join(workspace, "unconfigured"), { artifactsRepository: "" });
    await expect(unconfigured.artifacts.download("docs/AGENTS.md", "AGENTS.md")).rejects.toBeInstanceOf(
      ArtifactsRepositoryNotConfiguredError,
    );
    expect(unconfigured.git.sparseClones).toEqual([]);
  });

  it("fails when the file does not exist at the latest commit", async () => {
    git.missingPaths.add("docs/AGENTS.md");
    await expect(artifacts.download("docs/AGENTS.md", "AGENTS.md")).rejects.toThrow(
      `No file "docs/AGENTS.md" in the latest commit of ${url}.`,
    );
  });

  it("removes the temporary clone, also after a failure", async () => {
    await artifacts.download("docs/AGENTS.md", "AGENTS.md");
    const cloneDir = git.sparseClones[0]!.destination;
    expect((await readdir(tmpdir())).filter((entry) => entry.startsWith("faberic-artifacts-"))).toEqual([]);

    git.missingPaths.add("docs/AGENTS.md");
    await expect(artifacts.download("docs/AGENTS.md", "AGENTS.md")).rejects.toThrow();
    expect((await readdir(tmpdir())).filter((entry) => entry.startsWith("faberic-artifacts-"))).toEqual([]);
    expect(cloneDir).not.toBe(workspace);
  });
});
