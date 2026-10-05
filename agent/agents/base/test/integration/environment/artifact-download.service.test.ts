import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ArtifactDownloadService } from "../../../src/services/environment/artifact-download.service.ts";
import { GitClient } from "../../../src/utils/clients/git/client.ts";
import type { GitTokenSource } from "../../../src/utils/clients/orchestrator/client.ts";
import { ArtifactNotFoundError } from "../../../src/utils/errors/environment.errors.ts";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { createTestLogger } from "../../mocks/logger.mock.ts";
import { workspaceConfig } from "../../mocks/environment.mock.ts";

async function git(cwd: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "ignore" });
  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  expect(exitCode).toBe(0);
  return stdout.trim();
}

async function commit(repo: string, file: string, content: string): Promise<void> {
  await mkdir(dirname(join(repo, file)), { recursive: true });
  await writeFile(join(repo, file), content);
  await git(repo, "add", file);
  await git(repo, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", file);
}

/** Records token requests; a file:// URL must never trigger one. */
class RecordingTokens implements GitTokenSource {
  readonly requested: string[] = [];
  async getGitToken(url: string): Promise<string> {
    this.requested.push(url);
    return "unused";
  }
}

describe("ArtifactDownloadService against the real git binary (local repository)", () => {
  let dir: string;
  let source: string;
  let workspace: string;
  let tokens: RecordingTokens;
  let artifacts: ArtifactDownloadService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-base-artifacts-"));
    source = join(dir, "artifacts");
    await git(dir, "init", "--quiet", source);
    await commit(source, "docs/AGENTS.md", "v1");
    await commit(source, "prompts/SYSTEM.md", "system");
    await commit(source, "skills/lint/SKILL.md", "lint skill");
    await commit(source, "skills/lint/reference.md", "reference");
    workspace = join(dir, "workspace");
    tokens = new RecordingTokens();
    const config = workspaceConfig(workspace, 3, `file://${source}`);
    const { logger } = createTestLogger();
    artifacts = new ArtifactDownloadService(new GitClient(), tokens, config, logger);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("downloads the latest version of a single file into the workspace", async () => {
    const { path } = await artifacts.download("docs/AGENTS.md", join("nested", "AGENTS.md"));
    expect(path).toBe(join(workspace, "nested", "AGENTS.md"));
    expect(await readFile(path, "utf8")).toBe("v1");
    expect(tokens.requested).toEqual([]);
  });

  it("gets the newest content after a new commit", async () => {
    await commit(source, "docs/AGENTS.md", "v2");
    const { path } = await artifacts.download("docs/AGENTS.md", "AGENTS.md");
    expect(await readFile(path, "utf8")).toBe("v2");
  });

  it("checks out the skill file without its siblings", async () => {
    const { path } = await artifacts.download("skills/lint/SKILL.md", join(".pi", "skills", "lint", "SKILL.md"));
    expect(await readFile(path, "utf8")).toBe("lint skill");
  });

  it("replaces an existing destination", async () => {
    await commit(source, "docs/AGENTS.md", "v2");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "AGENTS.md"), "old");
    const { path } = await artifacts.download("docs/AGENTS.md", "AGENTS.md");
    expect(await readFile(path, "utf8")).toBe("v2");
  });

  it("fails when the file does not exist at the latest commit", async () => {
    await expect(artifacts.download("docs/missing.md", "AGENTS.md")).rejects.toThrow(
      `No file "docs/missing.md" in the latest commit of file://${source}.`,
    );
  });

  it("refuses a directory path", async () => {
    const error = await artifacts.download("docs", "AGENTS.md").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArtifactNotFoundError);
    expect((error as ArtifactNotFoundError).isDirectory).toBe(true);
  });

  it("rejects a destination outside the workspace before cloning", async () => {
    await expect(artifacts.download("docs/AGENTS.md", "../escape.md")).rejects.toThrow(ValidationError);
    expect(await Bun.file(join(dir, "escape.md")).exists()).toBe(false);
  });

  it("removes the temporary clone after the download", async () => {
    await artifacts.download("docs/AGENTS.md", "AGENTS.md");
    const leftovers = (await Array.fromAsync(new Bun.Glob("faberic-artifacts-*").scan(tmpdir()))).length;
    expect(leftovers).toBe(0);
    expect((await stat(workspace)).isDirectory()).toBe(true);
  });
});
