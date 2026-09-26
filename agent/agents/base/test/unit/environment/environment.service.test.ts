import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnvironmentService } from "../../../src/services/environment/environment.service.ts";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { createMockedEnvironmentStack, type MockGit, type MockGitTokenSource } from "../../mocks/environment.mock.ts";
import type { MemoryLogFile } from "../../mocks/logger.mock.ts";
import type { RecordingObserver } from "../../mocks/session-sdk.mock.ts";

describe("EnvironmentService", () => {
  let workspace: string;
  let git: MockGit;
  let tokens: MockGitTokenSource;
  let observer: RecordingObserver;
  let service: EnvironmentService;
  let log: MemoryLogFile;
  let cleanup: () => Promise<void>;

  const events = () => observer.events.map(({ type, description }) => ({ type, description }));

  beforeEach(() => {
    ({ workspace, git, tokens, observer, service, log, cleanup } = createMockedEnvironmentStack());
  });

  afterEach(() => cleanup());

  describe("ensureWorkspace", () => {
    it("creates the workspace, including missing parents, and returns its path", async () => {
      const nested = createMockedEnvironmentStack(join(workspace, "a", "b"));
      expect(await nested.service.ensureWorkspace()).toBe(join(workspace, "a", "b"));
      expect((await stat(join(workspace, "a", "b"))).isDirectory()).toBe(true);
      expect(nested.observer.events).toEqual([]);
    });

    it("keeps an existing workspace and its contents", async () => {
      await service.ensureWorkspace();
      await writeFile(join(workspace, "keep.txt"), "x");
      await service.ensureWorkspace();
      expect(await readFile(join(workspace, "keep.txt"), "utf8")).toBe("x");
    });
  });

  describe("cloneRepositories", () => {
    const url = "https://example.com/org/repo.git";

    it("clones into a folder named after the repository with the orchestrator's token", async () => {
      const path = join(workspace, "repo");
      expect(await service.cloneRepositories([{ url }])).toEqual([{ url, path, status: "cloned" }]);
      expect(tokens.requested).toEqual([url]);
      expect(git.clones).toEqual([{ url, destination: path, options: { depth: undefined, token: `token-for-${url}` } }]);
      expect(events()).toEqual([
        { type: "repository_clone_start", description: `clone ${url} into ${path} started` },
        { type: "repository_clone_end", description: `clone ${url} into ${path} finished` },
      ]);
    });

    it("sends events without a session id and never includes the token", async () => {
      await service.cloneRepositories([{ url }]);
      for (const event of observer.events) {
        expect(event.sessionId).toBeUndefined();
        expect(event.time).toBeInstanceOf(Date);
        expect(event.description).not.toContain("token-for-");
      }
    });

    it("passes the depth only when one is given", async () => {
      await service.cloneRepositories([
        { url: "https://example.com/shallow", depth: 1 },
        { url: "https://example.com/full" },
      ]);
      const depthOf = (url: string) => git.clones.find((clone) => clone.url === url)!.options.depth;
      expect(depthOf("https://example.com/shallow")).toBe(1);
      expect(depthOf("https://example.com/full")).toBeUndefined();
    });

    it("asks for a token only for HTTP(S) URLs", async () => {
      await service.cloneRepositories([{ url: "git@example.com:org/ssh.git" }, { url: "/srv/git/local" }]);
      expect(tokens.requested).toEqual([]);
      expect(git.clones.map(({ options }) => options.token)).toEqual([undefined, undefined]);
    });

    it("clones into the given directory", async () => {
      const [result] = await service.cloneRepositories([{ url, directory: "apps/web" }]);
      expect(result!.path).toBe(join(workspace, "apps", "web"));
      expect(await readFile(join(result!.path, "README.md"), "utf8")).toBe(url);
    });

    it("keeps going when one repository fails and reports each result in request order", async () => {
      git.failing.add("https://example.com/missing");
      tokens.missing.add("https://example.com/no-token");
      await mkdir(join(workspace, "exists"), { recursive: true });

      const results = await service.cloneRepositories([
        { url: "https://example.com/missing" },
        { url: "https://example.com/ok" },
        { url: "https://example.com/no-token" },
        { url: "https://example.com/exists" },
      ]);

      expect(results).toEqual([
        {
          url: "https://example.com/missing",
          path: join(workspace, "missing"),
          status: "failed",
          error: "git clone failed with exit code 128: fatal: repository 'https://example.com/missing' not found",
        },
        { url: "https://example.com/ok", path: join(workspace, "ok"), status: "cloned" },
        {
          url: "https://example.com/no-token",
          path: join(workspace, "no-token"),
          status: "failed",
          error: 'Orchestrator API returned no git token for "https://example.com/no-token".',
        },
        {
          url: "https://example.com/exists",
          path: join(workspace, "exists"),
          status: "failed",
          error: `"${join(workspace, "exists")}" already exists. Clone into another directory.`,
        },
      ]);
      expect(git.clones.map((clone) => clone.url)).toEqual(["https://example.com/ok"]);
      expect(tokens.requested).not.toContain("https://example.com/exists");
      expect(events().filter((event) => event.type === "repository_clone_error")).toHaveLength(3);
      expect(events().filter((event) => event.type === "repository_clone_end")).toHaveLength(1);
    });

    it("logs each failed clone as an error", async () => {
      git.failing.add("https://example.com/missing");
      await service.cloneRepositories([{ url: "https://example.com/missing" }, { url: "https://example.com/ok" }]);

      expect(log.lines).toHaveLength(1);
      expect(log.lines[0]).toEndWith(
        ` error: clone https://example.com/missing into ${join(workspace, "missing")} failed: git clone failed with exit code 128: fatal: repository 'https://example.com/missing' not found`,
      );
    });

    it("runs at most three clones at once and still clones every repository", async () => {
      git.delayMs = 20;
      const urls = Array.from({ length: 7 }, (_, i) => `https://example.com/repo-${i}`);
      const results = await service.cloneRepositories(urls.map((url) => ({ url })));

      expect(git.maxConcurrent).toBe(3);
      expect(results.map((result) => result.url)).toEqual(urls);
      expect(results.every((result) => result.status === "cloned")).toBe(true);
    });

    it("uses the configured concurrency", async () => {
      const serial = createMockedEnvironmentStack(join(workspace, "serial"), { cloneConcurrency: 1 });
      serial.git.delayMs = 5;
      await serial.service.cloneRepositories([{ url: "https://example.com/a" }, { url: "https://example.com/b" }]);
      expect(serial.git.maxConcurrent).toBe(1);
    });

    it("rejects the whole batch before anything starts when a directory is invalid or shared", async () => {
      await expect(service.cloneRepositories([{ url }, { url, directory: "../out" }])).rejects.toThrow(ValidationError);
      await expect(service.cloneRepositories([{ url, directory: "/etc/repo" }])).rejects.toThrow(
        '"directory" must stay inside the workspace',
      );
      await expect(
        service.cloneRepositories([{ url: "https://example.com/a/repo" }, { url: "https://example.com/b/repo.git" }]),
      ).rejects.toThrow(`More than one repository would be cloned into "${join(workspace, "repo")}"`);
      expect(git.clones).toEqual([]);
      expect(tokens.requested).toEqual([]);
      expect(observer.events).toEqual([]);
    });
  });

  describe("createAgentMd", () => {
    it("writes AGENTS.md at the workspace root and reports start and end", async () => {
      const path = join(workspace, "AGENTS.md");
      expect(await service.createAgentMd({ content: "# Rules" })).toEqual({ path });
      expect(await readFile(path, "utf8")).toBe("# Rules");
      expect(events()).toEqual([
        { type: "agent_md_create_start", description: `write ${path} started` },
        { type: "agent_md_create_end", description: `write ${path} finished` },
      ]);
    });

    it("replaces an existing file", async () => {
      await service.createAgentMd({ content: "old" });
      const { path } = await service.createAgentMd({ content: "new" });
      expect(await readFile(path, "utf8")).toBe("new");
    });

    it("reports a failed write", async () => {
      await mkdir(join(workspace, "AGENTS.md"), { recursive: true });
      await expect(service.createAgentMd({ content: "x" })).rejects.toThrow();
      expect(events().map((event) => event.type)).toEqual(["agent_md_create_start", "agent_md_create_error"]);
      expect(events()[1]!.description).toStartWith(`write ${join(workspace, "AGENTS.md")} failed: `);
    });
  });

  describe("injectSkill", () => {
    it("writes .pi/skills/<name>/SKILL.md and reports start and end", async () => {
      const path = join(workspace, ".pi", "skills", "pdf-tools", "SKILL.md");
      expect(await service.injectSkill({ name: "pdf-tools", content: "---\nname: pdf-tools\n---" })).toEqual({ path });
      expect(await readFile(path, "utf8")).toBe("---\nname: pdf-tools\n---");
      expect(events()).toEqual([
        { type: "skill_inject_start", description: `inject skill pdf-tools into ${path} started` },
        { type: "skill_inject_end", description: `inject skill pdf-tools into ${path} finished` },
      ]);
    });

    it("reports a failed write", async () => {
      await mkdir(workspace, { recursive: true });
      await writeFile(join(workspace, ".pi"), "not a folder");
      await expect(service.injectSkill({ name: "lint", content: "x" })).rejects.toThrow();
      expect(events().map((event) => event.type)).toEqual(["skill_inject_start", "skill_inject_error"]);
    });
  });
});
