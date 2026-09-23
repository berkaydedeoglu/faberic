import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ConfigService } from "../../../src/config/config.service.ts";
import { EventManager } from "../../../src/services/event/event-manager.service.ts";
import { OrchestratorClient } from "../../../src/utils/clients/orchestrator/client.ts";
import { UnavailableError } from "../../../src/utils/errors/app.errors.ts";
import {
  OrchestratorNotConfiguredError,
  OrchestratorRequestError,
} from "../../../src/utils/errors/orchestrator.errors.ts";

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

  function client(env: Record<string, string> = {}): OrchestratorClient {
    const config = ConfigService.load({
      ORCHESTRATOR_API_URL: `http://127.0.0.1:${server.port}/api/events`,
      ORCHESTRATOR_API_TOKEN: "secret-token",
      ...env,
    });
    return new OrchestratorClient({ get: () => config } as ConfigService);
  }

  beforeEach(() => {
    received = [];
    status = 202;
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
        return new Response(null, { status });
      },
    });
  });

  afterEach(() => {
    server.stop(true);
  });

  it("POSTs the batch as JSON to the configured URL with the bearer token", async () => {
    const time = new Date("2026-09-23T10:00:00.000Z");
    await client().sendEvents([{ type: "session.created", time, description: "created session abc" }]);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      method: "POST",
      path: "/api/events",
      headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
      body: { events: [{ type: "session.created", time: "2026-09-23T10:00:00.000Z", description: "created session abc" }] },
    });
  });

  it("reports a non-2xx answer as OrchestratorRequestError", async () => {
    status = 500;
    const attempt = client().sendEvents([{ type: "a", time: new Date(), description: "b" }]);
    await expect(attempt).rejects.toThrow(OrchestratorRequestError);
    await expect(client().sendEvents([])).rejects.toThrow("HTTP 500");
    await expect(client().sendEvents([])).rejects.toThrow(UnavailableError);
  });

  it("refuses to send without a URL or token, without making a request", async () => {
    await expect(client({ ORCHESTRATOR_API_URL: "" }).sendEvents([])).rejects.toThrow(OrchestratorNotConfiguredError);
    await expect(client({ ORCHESTRATOR_API_TOKEN: "" }).sendEvents([])).rejects.toThrow(OrchestratorNotConfiguredError);
    expect(received).toEqual([]);
  });

  it("end to end: 50 observed events arrive as a single POST", async () => {
    const config = ConfigService.load({
      ORCHESTRATOR_API_URL: `http://127.0.0.1:${server.port}/api/events`,
      ORCHESTRATOR_API_TOKEN: "secret-token",
    });
    const manager = new EventManager(client(), { get: () => config } as ConfigService);

    for (let i = 0; i < 50; i++) manager.update({ type: "test", time: new Date(), description: `event ${i}` });
    await manager.stop();

    expect(received).toHaveLength(1);
    const { events } = received[0]!.body as { events: { description: string }[] };
    expect(events.map((event) => event.description)).toEqual(Array.from({ length: 50 }, (_, i) => `event ${i}`));
  });
});
