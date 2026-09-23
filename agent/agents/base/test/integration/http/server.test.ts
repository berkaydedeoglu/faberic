import { describe, expect, it } from "bun:test";
import { SessionHttpHandler } from "../../../src/http/handlers/session.handler.ts";
import { startServer } from "../../../src/http/server.ts";
import { createMockedSessionStack } from "../../mocks/session-sdk.mock.ts";

describe("startServer", () => {
  it("listens on the given host and port", async () => {
    const app = startServer(new SessionHttpHandler(createMockedSessionStack().controller), { port: 0, host: "127.0.0.1" });
    try {
      const res = await fetch(`http://127.0.0.1:${app.server!.port}/health`);
      expect(await res.json()).toEqual({ status: "ok" });
    } finally {
      await app.stop();
    }
  });
});
