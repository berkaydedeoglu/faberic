import { beforeEach, describe, expect, it } from "bun:test";
import { SessionHttpHandler } from "../../../src/http/handlers/session.handler.ts";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { createMockedSessionStack } from "../../mocks/session-sdk.mock.ts";

describe("SessionHttpHandler", () => {
  let handler: SessionHttpHandler;

  beforeEach(() => {
    handler = new SessionHttpHandler(createMockedSessionStack().controller);
  });

  it("sets 201 on create", async () => {
    const set: { status?: number | string } = {};
    const session = await handler.create({ body: { model: "gpt-5", provider: "openai" }, set });
    expect(set.status).toBe(201);
    expect(session.model?.id).toBe("gpt-5");
  });

  it("treats a missing or non-object body as empty", async () => {
    const set: { status?: number | string } = {};
    await handler.create({ body: undefined, set });
    expect(set.status).toBe(201);
    await expect(handler.prompt({ body: "not-json" })).rejects.toThrow(ValidationError);
  });

  it("reads the provider filter from the query string", async () => {
    expect(await handler.listModels({ query: { provider: "anthropic" } })).toEqual([
      { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    ]);
  });

  it("reads cwd and the all flag for listing from the query string", async () => {
    await handler.create({ body: { cwd: "/elsewhere" }, set: {} });
    await handler.prompt({ body: { text: "hi" } });
    await handler.destroy();

    expect(await handler.list({ query: {} })).toEqual([]);
    expect(await handler.list({ query: { cwd: "/elsewhere" } })).toHaveLength(1);
    expect(await handler.list({ query: { all: "true" } })).toHaveLength(1);
    expect(await handler.list({ query: { all: "yes" } })).toEqual([]);
  });

  it("continues a session from the request body", async () => {
    const { id } = await handler.create({ body: {}, set: {} });
    await handler.prompt({ body: { text: "hi" } });
    await handler.destroy();
    expect((await handler.continue({ body: { sessionId: id } })).id).toBe(id);
    await expect(handler.continue({ body: undefined })).rejects.toThrow(ValidationError);
  });
});
