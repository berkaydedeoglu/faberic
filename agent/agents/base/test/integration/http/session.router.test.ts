import { beforeEach, describe, expect, it } from "bun:test";
import { SessionHttpHandler } from "../../../src/http/handlers/session.handler.ts";
import { createApp } from "../../../src/http/server.ts";
import { createMockedSessionStack } from "../../mocks/session-sdk.mock.ts";

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("HTTP API (router -> handler -> controller -> services, mocked SDK)", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(new SessionHttpHandler(createMockedSessionStack().controller));
  });

  it("GET /session/models works without a session", async () => {
    const res = await app.handle(request("GET", "/session/models?provider=anthropic"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }]);
  });

  it("maps domain errors to status codes", async () => {
    const noSession = await app.handle(request("GET", "/session/model"));
    expect(noSession.status).toBe(404);
    expect(await noSession.json()).toEqual({ error: "NoActiveSessionError", message: "No active session. Create one first." });

    expect((await app.handle(request("POST", "/session", { provider: "  " }))).status).toBe(400);

    await app.handle(request("POST", "/session", {}));
    expect((await app.handle(request("POST", "/session", {}))).status).toBe(409);
  });

  it("returns 503 when the session's provider has no credentials", async () => {
    await app.handle(request("POST", "/session", { provider: "mistral", model: "mistral-large" }));
    const res = await app.handle(request("POST", "/session/prompt", { text: "hi" }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("MissingCredentialsError");
  });

  it("returns 404 for unknown routes", async () => {
    expect((await app.handle(request("GET", "/nope"))).status).toBe(404);
  });

  it("runs the full session lifecycle", async () => {
    const created = await app.handle(request("POST", "/session", { provider: "anthropic", model: "claude-sonnet-4-5" }));
    expect(created.status).toBe(201);

    const prompted = await app.handle(request("POST", "/session/prompt", { text: "hello" }));
    const promptResult = (await prompted.json()) as { messages: unknown[]; stats: { totalMessages: number } };
    expect(promptResult.messages).toHaveLength(2);
    expect(promptResult.stats.totalMessages).toBe(2);

    const followed = await app.handle(request("POST", "/session/follow-up", { text: "more" }));
    expect(((await followed.json()) as { messages: unknown[] }).messages).toHaveLength(4);

    const model = await app.handle(request("PUT", "/session/model", { provider: "openai", model: "gpt-5" }));
    expect(await model.json()).toEqual({ provider: "openai", id: "gpt-5", name: "gpt-5" });
    expect(await (await app.handle(request("GET", "/session/model"))).json()).toEqual({
      provider: "openai",
      id: "gpt-5",
      name: "gpt-5",
    });

    const thinking = await app.handle(request("PUT", "/session/thinking-level", { thinkingLevel: "high" }));
    expect(((await thinking.json()) as { thinkingLevel: string }).thinkingLevel).toBe("high");
    expect(((await (await app.handle(request("GET", "/session/thinking-level"))).json()) as { available: string[] }).available).toContain("high");

    expect(((await (await app.handle(request("GET", "/session/stats"))).json()) as { totalMessages: number }).totalMessages).toBe(4);
    expect((await (await app.handle(request("GET", "/session/messages"))).json()) as unknown[]).toHaveLength(4);
    expect((await app.handle(request("GET", "/session"))).status).toBe(200);
    expect((await app.handle(request("POST", "/session/abort"))).status).toBe(200);

    const destroyed = await app.handle(request("DELETE", "/session"));
    expect(await destroyed.json()).toEqual({ status: "disposed" });
    expect((await app.handle(request("GET", "/session"))).status).toBe(404);
  });

  it("lists stored sessions and continues one with its history", async () => {
    const created = (await (await app.handle(request("POST", "/session", {}))).json()) as { id: string };
    await app.handle(request("POST", "/session/prompt", { text: "remember me" }));
    await app.handle(request("DELETE", "/session"));

    const listed = await app.handle(request("GET", "/session/list"));
    expect(listed.status).toBe(200);
    const sessions = (await listed.json()) as { id: string; messageCount: number; firstMessage: string }[];
    expect(sessions).toEqual([expect.objectContaining({ id: created.id, messageCount: 2, firstMessage: "remember me" })]);
    expect(await (await app.handle(request("GET", "/session/list?cwd=/elsewhere"))).json()).toEqual([]);
    expect(await (await app.handle(request("GET", "/session/list?all=true"))).json()).toHaveLength(1);

    const continued = await app.handle(request("POST", "/session/continue", { sessionId: created.id }));
    expect(continued.status).toBe(200);
    expect(((await continued.json()) as { id: string }).id).toBe(created.id);
    expect((await (await app.handle(request("GET", "/session/messages"))).json()) as unknown[]).toHaveLength(2);
  });

  it("maps continue errors to status codes", async () => {
    expect((await app.handle(request("POST", "/session/continue", {}))).status).toBe(400);

    const missing = await app.handle(request("POST", "/session/continue", { sessionId: "missing" }));
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: string }).error).toBe("SessionNotFoundError");

    const stored = (await (await app.handle(request("POST", "/session", {}))).json()) as { id: string };
    await app.handle(request("POST", "/session/prompt", { text: "hi" }));
    await app.handle(request("DELETE", "/session"));
    await app.handle(request("POST", "/session", {}));
    expect((await app.handle(request("POST", "/session/continue", { sessionId: stored.id }))).status).toBe(409);
    expect((await app.handle(request("POST", "/session/continue", { sessionId: stored.id, force: true }))).status).toBe(200);
  });
});
