import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { EnvironmentHttpHandler } from "../../../src/http/handlers/environment.handler.ts";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { createMockedEnvironmentStack, type MockGit } from "../../mocks/environment.mock.ts";

describe("EnvironmentHttpHandler", () => {
  let workspace: string;
  let git: MockGit;
  let handler: EnvironmentHttpHandler;
  let cleanup: () => Promise<void>;

  beforeEach(() => {
    const stack = createMockedEnvironmentStack();
    ({ workspace, git, cleanup } = stack);
    handler = new EnvironmentHttpHandler(stack.controller);
  });

  afterEach(() => cleanup());

  it("sets 201 on every operation", async () => {
    const set: { status?: number | string } = {};
    expect(await handler.clone({ body: { repositories: [{ url: "https://example.com/repo" }] }, set })).toEqual({
      repositories: [{ url: "https://example.com/repo", path: join(workspace, "repo"), status: "cloned" }],
    });
    expect(set.status).toBe(201);

    const agentMd: { status?: number | string } = {};
    await handler.createAgentMd({ body: { content: "rules" }, set: agentMd });
    expect(agentMd.status).toBe(201);

    const skill: { status?: number | string } = {};
    await handler.injectSkill({ body: { name: "lint", content: "x" }, set: skill });
    expect(skill.status).toBe(201);
  });

  it("sets 207 on a clone when some repositories fail", async () => {
    git.failing.add("https://example.com/missing");
    const set: { status?: number | string } = {};
    const { repositories } = await handler.clone({
      body: { repositories: [{ url: "https://example.com/ok" }, { url: "https://example.com/missing" }] },
      set,
    });
    expect(set.status).toBe(207);
    expect(repositories.map((repository) => repository.status)).toEqual(["cloned", "failed"]);
  });

  it("treats a missing or non-object body as empty and keeps the status", async () => {
    const set: { status?: number | string } = {};
    await expect(handler.clone({ body: undefined, set })).rejects.toThrow(ValidationError);
    await expect(handler.createAgentMd({ body: "text", set })).rejects.toThrow(ValidationError);
    await expect(handler.injectSkill({ body: null, set })).rejects.toThrow(ValidationError);
    expect(set.status).toBeUndefined();
  });
});
