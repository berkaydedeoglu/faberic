import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ConfigService } from "../../../src/config/config.service.ts";
import { EventManager } from "../../../src/services/event/event-manager.service.ts";
import { OrchestratorClient } from "../../../src/utils/clients/orchestrator/client.ts";
import { UnavailableError } from "../../../src/utils/errors/app.errors.ts";
import {
  GitTokenMissingError,
  OrchestratorNotConfiguredError,
  OrchestratorRequestError,
} from "../../../src/utils/errors/orchestrator.errors.ts";
import { createTestLogger } from "../../mocks/logger.mock.ts";

interface ReceivedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

describe("OrchestratorClient against a local HTTP server", () => {
  let server: ReturnType<typeof Bun.serve>;
  let received: ReceivedRequest[];
  let status: number;
  let tokenBody: unknown;

  function client(env: Record<string, string> = {}): OrchestratorClient {
    const config = ConfigService.load({
      ORCHESTRATOR_API_URL: `http://127.0.0.1:${server.port}/api`,
      ORCHESTRATOR_API_TOKEN: "secret-token",
      ...env,
    });
    return new OrchestratorClient({ get: () => config } as ConfigService);
  }

  beforeEach(() => {
    received = [];
    status = 202;
    tokenBody = { token: "gho_device_flow_token" };
    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        received.push({
          method: request.method,
          path: new URL(request.url).pathname,
          headers: Object.fromEntries(request.headers),
          body: await request.json(),
        });
        if (new URL(request.url).pathname.endsWith("/git/token")) {
          return typeof tokenBody === "string" ? new Response(tokenBody, { status }) : Response.json(tokenBody, { status });
        }
        return new Response(null, { status });
      },
    });
  });

  afterEach(() => {
    server.stop(true);
  });

  it("POSTs the batch as JSON to <base>/events with the bearer token", async () => {
    const time = new Date("2026-09-23T10:00:00.000Z");
    await client().sendEvents([{ type: "session.created", sessionId: "abc", time, description: "created session abc" }]);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      method: "POST",
      path: "/api/events",
      headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
      body: { events: [{ type: "session.created", sessionId: "abc", time: "2026-09-23T10:00:00.000Z", description: "created session abc" }] },
    });
  });

  it("reports a non-2xx answer as OrchestratorRequestError", async () => {
    status = 500;
    const attempt = client().sendEvents([{ type: "a", sessionId: "s1", time: new Date(), description: "b" }]);
    await expect(attempt).rejects.toThrow(OrchestratorRequestError);
    await expect(client().sendEvents([])).rejects.toThrow("Orchestrator API answered POST /events with HTTP 500.");
    await expect(client().sendEvents([])).rejects.toThrow(UnavailableError);
  });

  it("accepts a base URL with a trailing slash", async () => {
    await client({ ORCHESTRATOR_API_URL: `http://127.0.0.1:${server.port}/api/` }).sendEvents([]);
    expect(received[0]!.path).toBe("/api/events");
  });

  describe("getGitToken", () => {
    it("POSTs the repository URL to <base>/git/token and returns the token", async () => {
      expect(await client().getGitToken("https://github.com/org/private.git")).toBe("gho_device_flow_token");
      expect(received).toEqual([
        {
          method: "POST",
          path: "/api/git/token",
          headers: expect.objectContaining({ authorization: "Bearer secret-token", "content-type": "application/json" }),
          body: { url: "https://github.com/org/private.git" },
        },
      ]);
    });

    it("fails when the answer has no token", async () => {
      for (const body of [{}, { token: "" }, { token: 42 }, null, "not json"]) {
        tokenBody = body;
        await expect(client().getGitToken("https://github.com/org/repo")).rejects.toThrow(GitTokenMissingError);
      }
    });

    it("reports a non-2xx answer as OrchestratorRequestError", async () => {
      status = 404;
      await expect(client().getGitToken("https://github.com/org/repo")).rejects.toThrow(
        "Orchestrator API answered POST /git/token with HTTP 404.",
      );
    });

    it("refuses without a URL or token, without making a request", async () => {
      await expect(client({ ORCHESTRATOR_API_TOKEN: "" }).getGitToken("https://x")).rejects.toThrow(
        OrchestratorNotConfiguredError,
      );
      expect(received).toEqual([]);
    });
  });

  it("refuses to send without a URL or token, without making a request", async () => {
    await expect(client({ ORCHESTRATOR_API_URL: "" }).sendEvents([])).rejects.toThrow(OrchestratorNotConfiguredError);
    await expect(client({ ORCHESTRATOR_API_TOKEN: "" }).sendEvents([])).rejects.toThrow(OrchestratorNotConfiguredError);
    expect(received).toEqual([]);
  });

  it("end to end: 50 observed events arrive as a single POST", async () => {
    const config = ConfigService.load({
      ORCHESTRATOR_API_URL: `http://127.0.0.1:${server.port}/api`,
      ORCHESTRATOR_API_TOKEN: "secret-token",
    });
    const manager = new EventManager(client(), { get: () => config } as ConfigService, createTestLogger().logger);

    for (let i = 0; i < 50; i++) manager.update({ type: "test", sessionId: "s1", time: new Date(), description: `event ${i}` });
    await manager.stop();

    expect(received).toHaveLength(1);
    const { events } = received[0]!.body as { events: { description: string }[] };
    expect(events.map((event) => event.description)).toEqual(Array.from({ length: 50 }, (_, i) => `event ${i}`));
  });
});
