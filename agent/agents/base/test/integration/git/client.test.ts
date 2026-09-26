import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitClient, isHttpUrl, repositoryName } from "../../../src/utils/clients/git/client.ts";
import { GitCommandError } from "../../../src/utils/errors/environment.errors.ts";

async function git(cwd: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "ignore" });
  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  expect(exitCode).toBe(0);
  return stdout.trim();
}

async function commit(repo: string, file: string, content: string): Promise<void> {
  await writeFile(join(repo, file), content);
  await git(repo, "add", file);
  await git(repo, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", file);
}

describe("repositoryName", () => {
  it("takes the last path segment without .git, like git clone", () => {
    expect(repositoryName("https://github.com/org/repo.git")).toBe("repo");
    expect(repositoryName("https://github.com/org/repo/")).toBe("repo");
    expect(repositoryName("git@github.com:org/repo.git")).toBe("repo");
    expect(repositoryName("git@github.com:repo.git")).toBe("repo");
    expect(repositoryName("/srv/git/project")).toBe("project");
  });
});

describe("isHttpUrl", () => {
  it("is true only for http and https URLs", () => {
    expect(isHttpUrl("https://github.com/org/repo")).toBe(true);
    expect(isHttpUrl("HTTP://example.com/repo")).toBe(true);
    expect(isHttpUrl("git@github.com:org/repo.git")).toBe(false);
    expect(isHttpUrl("ssh://git@github.com/org/repo")).toBe(false);
    expect(isHttpUrl("/srv/git/repo")).toBe(false);
  });
});

describe("GitClient against the real git binary (local repositories only)", () => {
  let dir: string;
  let source: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-base-git-"));
    source = join(dir, "source");
    await git(dir, "init", "--quiet", source);
    await commit(source, "README.md", "hello");
    await commit(source, "CHANGELOG.md", "v2");
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("clones a repository into the destination", async () => {
    const destination = join(dir, "workspace", "clone");
    await new GitClient().clone(source, destination);
    expect(await readFile(join(destination, "README.md"), "utf8")).toBe("hello");
    expect(await git(destination, "rev-list", "--count", "HEAD")).toBe("2");
  });

  it("downloads only the given number of commits when a depth is given", async () => {
    const destination = join(dir, "shallow");
    await new GitClient().clone(`file://${source}`, destination, { depth: 1 });
    expect(await git(destination, "rev-list", "--count", "HEAD")).toBe("1");
    expect(await git(destination, "rev-parse", "--is-shallow-repository")).toBe("true");
  });

  it("sends the token as basic auth to the repository's host and does not store it", async () => {
    const headers: (string | null)[] = [];
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        headers.push(request.headers.get("authorization"));
        return new Response("no", { status: 403 });
      },
    });
    try {
      const destination = join(dir, "private");
      const url = `http://127.0.0.1:${server.port}/org/private.git`;
      await expect(new GitClient().clone(url, destination, { token: "gho_secret" })).rejects.toThrow(GitCommandError);
      expect(headers.length).toBeGreaterThan(0);
      expect(headers[0]).toBe(`Basic ${btoa("x-access-token:gho_secret")}`);
    } finally {
      server.stop(true);
    }
  });

  it("ignores a token for URLs that are not HTTP(S)", async () => {
    const destination = join(dir, "clone");
    await new GitClient().clone(source, destination, { token: "gho_secret" });
    expect(await readFile(join(destination, ".git", "config"), "utf8")).not.toContain("gho_secret");
  });

  it("fails with git's exit code and message", async () => {
    const error = await new GitClient().clone(join(dir, "missing"), join(dir, "clone")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitCommandError);
    expect((error as GitCommandError).exitCode).not.toBe(0);
    expect((error as GitCommandError).message).toContain("git clone failed with exit code");
    expect((error as GitCommandError).stderr).toContain("missing");
  });

  it("treats a URL that looks like an option as a URL", async () => {
    await expect(new GitClient().clone("--upload-pack=touch pwned", join(dir, "clone"))).rejects.toThrow(GitCommandError);
  });

  it("refuses the ext:: transport, which would run a command (git default)", async () => {
    const marker = join(dir, "pwned");
    await expect(new GitClient().clone(`ext::sh -c touch% ${marker}`, join(dir, "clone"))).rejects.toThrow(GitCommandError);
    expect(await Bun.file(marker).exists()).toBe(false);
  });
});
