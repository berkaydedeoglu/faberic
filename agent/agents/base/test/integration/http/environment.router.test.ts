import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EnvironmentHttpHandler } from "../../../src/http/handlers/environment.handler.ts";
import { MonitoringHttpHandler } from "../../../src/http/handlers/monitoring.handler.ts";
import { SessionHttpHandler } from "../../../src/http/handlers/session.handler.ts";
import { createApp } from "../../../src/http/server.ts";
import { createTestLogger } from "../../mocks/logger.mock.ts";
import { createMockedMonitoringStack } from "../../mocks/monitoring.mock.ts";
import { createMockedEnvironmentStack, type MockGit } from "../../mocks/environment.mock.ts";
import type { RecordingObserver } from "../../mocks/session-sdk.mock.ts";
import { createMockedSessionStack } from "../../mocks/session-sdk.mock.ts";

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("HTTP API /environment (router -> handler -> controller -> service, mocked git)", () => {
  let app: ReturnType<typeof createApp>;
  let workspace: string;
  let git: MockGit;
  let observer: RecordingObserver;
  let cleanup: () => Promise<void>;

  beforeEach(() => {
    const stack = createMockedEnvironmentStack();
    ({ workspace, git, observer, cleanup } = stack);
    app = createApp({
      session: new SessionHttpHandler(createMockedSessionStack().controller),
      environment: new EnvironmentHttpHandler(stack.controller),
      monitoring: new MonitoringHttpHandler(createMockedMonitoringStack().controller),
    }, createTestLogger().logger);
  });

  afterEach(() => cleanup());

  it("POST /environment/clone clones every repository of the list and returns 201", async () => {
    const res = await app.handle(
      request("POST", "/environment/clone", {
        repositories: [{ url: "https://example.com/org/app.git", depth: 1 }, { url: "https://example.com/org/lib.git" }],
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      repositories: [
        { url: "https://example.com/org/app.git", path: join(workspace, "app"), status: "cloned" },
        { url: "https://example.com/org/lib.git", path: join(workspace, "lib"), status: "cloned" },
      ],
    });
    expect(observer.events.filter((event) => event.type === "repository_clone_end")).toHaveLength(2);
  });

  it("POST /environment/clone returns 207 with each result when some repositories fail", async () => {
    git.failing.add("https://example.com/missing");
    const res = await app.handle(
      request("POST", "/environment/clone", {
        repositories: [{ url: "https://example.com/ok" }, { url: "https://example.com/missing" }],
      }),
    );
    expect(res.status).toBe(207);
    const { repositories } = (await res.json()) as { repositories: { status: string; error?: string }[] };
    expect(repositories.map((repository) => repository.status)).toEqual(["cloned", "failed"]);
    expect(repositories[1]!.error).toContain("not found");
  });

  it("POST /environment/agent-md writes AGENTS.md", async () => {
    const res = await app.handle(request("POST", "/environment/agent-md", { content: "# Rules" }));
    expect(res.status).toBe(201);
    const { path } = (await res.json()) as { path: string };
    expect(path).toBe(join(workspace, "AGENTS.md"));
    expect(await readFile(path, "utf8")).toBe("# Rules");
  });

  it("POST /environment/skills writes the skill", async () => {
    const res = await app.handle(request("POST", "/environment/skills", { name: "lint", content: "skill" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ path: join(workspace, ".pi", "skills", "lint", "SKILL.md") });
  });

  it("returns 400 for invalid input, including directories outside the workspace", async () => {
    const cases: [string, unknown][] = [
      ["/environment/clone", {}],
      ["/environment/clone", { repositories: [] }],
      ["/environment/clone", { repositories: [{ url: "https://example.com/app", depth: -1 }] }],
      ["/environment/clone", { repositories: [{ url: "https://example.com/app", directory: "../escape" }] }],
      ["/environment/agent-md", { content: "" }],
      ["/environment/skills", { name: "Bad Name", content: "x" }],
    ];
    for (const [path, body] of cases) {
      const res = await app.handle(request("POST", path, body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("ValidationError");
    }
    expect(observer.events).toEqual([]);
  });
});
