import { describe, expect, it } from "bun:test";
import { EnvironmentHttpHandler } from "../../../src/http/handlers/environment.handler.ts";
import { MonitoringHttpHandler } from "../../../src/http/handlers/monitoring.handler.ts";
import { SessionHttpHandler } from "../../../src/http/handlers/session.handler.ts";
import { startServer } from "../../../src/http/server.ts";
import { createMockedEnvironmentStack } from "../../mocks/environment.mock.ts";
import { createTestLogger } from "../../mocks/logger.mock.ts";
import { createMockedMonitoringStack } from "../../mocks/monitoring.mock.ts";
import { createMockedSessionStack } from "../../mocks/session-sdk.mock.ts";

describe("startServer", () => {
  it("listens on the given host and port", async () => {
    const app = startServer(
      {
        session: new SessionHttpHandler(createMockedSessionStack().controller),
        environment: new EnvironmentHttpHandler(createMockedEnvironmentStack().controller),
        monitoring: new MonitoringHttpHandler(createMockedMonitoringStack().controller),
      },
      createTestLogger().logger,
      { port: 0, host: "127.0.0.1" },
    );
    try {
      const res = await fetch(`http://127.0.0.1:${app.server!.port}/health`);
      expect(await res.json()).toEqual({ status: "ok" });
    } finally {
      await app.stop();
    }
  });
});
