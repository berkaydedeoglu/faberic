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
    await expect(handler.prompt({ body: "not-json", query: {} })).rejects.toThrow(ValidationError);
  });

  it("reads the provider filter from the query string", async () => {
    expect(await handler.listModels({ query: { provider: "anthropic" } })).toEqual([
      { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    ]);
  });

  it("lists stored sessions", async () => {
    expect(await handler.list()).toEqual([]);
    await handler.create({ body: {}, set: {} });
    await handler.prompt({ body: { text: "hi" }, query: {} });
    await handler.destroy({ query: {} });
    expect(await handler.list()).toHaveLength(1);
  });

  it("continues a session from the request body", async () => {
    const { id } = await handler.create({ body: {}, set: {} });
    await handler.prompt({ body: { text: "hi" }, query: {} });
    await handler.destroy({ query: {} });
    expect((await handler.continue({ body: { sessionId: id } })).id).toBe(id);
    await expect(handler.continue({ body: undefined })).rejects.toThrow(ValidationError);
  });

  it("targets the session named by ?sessionId= and falls back to the default without it", async () => {
    const first = await handler.create({ body: {}, set: {} });
    const second = await handler.create({ body: { provider: "openai", model: "gpt-5" }, set: {} });

    expect((await handler.get({ query: {} })).id).toBe(first.id);
    expect((await handler.get({ query: { sessionId: "" } })).id).toBe(first.id);
    expect((await handler.get({ query: { sessionId: second.id } })).id).toBe(second.id);

    const reply = await handler.prompt({ body: { text: "hi", sessionId: first.id }, query: { sessionId: second.id } });
    expect(reply.messages).toHaveLength(2);
    expect(await handler.getMessages({ query: { sessionId: second.id } })).toHaveLength(2);
    expect(await handler.getMessages({ query: {} })).toHaveLength(0);

    expect((await handler.setDefault({ body: { sessionId: second.id } })).isDefault).toBe(true);
    expect((await handler.getModel({ query: {} })).id).toBe("gpt-5");
    expect(() => handler.setDefault({ body: {} })).toThrow(ValidationError);
  });
});
