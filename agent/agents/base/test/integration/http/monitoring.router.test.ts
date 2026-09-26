import { beforeEach, describe, expect, it } from "bun:test";
import { EnvironmentHttpHandler } from "../../../src/http/handlers/environment.handler.ts";
import { MonitoringHttpHandler } from "../../../src/http/handlers/monitoring.handler.ts";
import { SessionHttpHandler } from "../../../src/http/handlers/session.handler.ts";
import { createApp } from "../../../src/http/server.ts";
import { createMockedEnvironmentStack } from "../../mocks/environment.mock.ts";
import { createMockedMonitoringStack } from "../../mocks/monitoring.mock.ts";

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("HTTP API /monitoring (router -> handler -> controller -> service, mocked SDK)", () => {
  let app: ReturnType<typeof createApp>;
  let stack: ReturnType<typeof createMockedMonitoringStack>;

  beforeEach(() => {
    stack = createMockedMonitoringStack();
    app = createApp(
      {
        session: new SessionHttpHandler(stack.sessions.controller),
        environment: new EnvironmentHttpHandler(createMockedEnvironmentStack().controller),
        monitoring: new MonitoringHttpHandler(stack.controller),
      },
      stack.logger,
    );
  });

  it("GET /monitoring/sessions lists the sessions opened through the API", async () => {
    await app.handle(request("POST", "/session", {}));
    await app.handle(request("POST", "/session/prompt", { text: "hi" }));

    const res = await app.handle(request("GET", "/monitoring/sessions"));
    expect(res.status).toBe(200);
    const sessions = (await res.json()) as { id: string; isDefault: boolean; stats: { totalMessages: number } }[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ isDefault: true, stats: { totalMessages: 2 } });
  });

  it("GET /monitoring/events returns the event counters", async () => {
    await app.handle(request("POST", "/session", {}));
    await app.handle(request("POST", "/session/prompt", { text: "hi" }));

    const res = await app.handle(request("GET", "/monitoring/events"));
    expect(res.status).toBe(200);
    const stats = (await res.json()) as Record<string, unknown>;
    expect(stats).toMatchObject({ receivedByType: { agent_start: 1, agent_end: 1 }, sent: 0, lastSentAt: null, lastError: null });
  });

  it("GET /monitoring/errors returns an empty log at first", async () => {
    const res = await app.handle(request("GET", "/monitoring/errors"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ file: "/tmp/agent-test.log", log: "" });
  });

  it("logs 5xx responses as errors, so they show up in /monitoring/errors", async () => {
    await app.handle(request("POST", "/session", {}));
    stack.sessions.sdk.credentialedProviders.clear();
    // Missing credentials is a 503.
    expect((await app.handle(request("POST", "/session/prompt", { text: "hi" }))).status).toBe(503);

    const { log } = (await (await app.handle(request("GET", "/monitoring/errors"))).json()) as { log: string };
    expect(log.split("\n")).toHaveLength(1);
    expect(log).toContain("error: POST /session/prompt failed with 503: ");
  });

  it("logs client errors as warnings, which stay out of /monitoring/errors", async () => {
    expect((await app.handle(request("GET", "/session?sessionId=missing"))).status).toBe(404);
    expect((await app.handle(request("POST", "/session", { thinkingLevel: "loud" }))).status).toBe(400);

    expect(stack.writer.lines.map((line) => line.split(" ").slice(1, 5).join(" "))).toEqual([
      "warn: GET /session failed",
      "warn: POST /session failed",
    ]);
    expect(stack.file.lines).toEqual([]);
  });
});
