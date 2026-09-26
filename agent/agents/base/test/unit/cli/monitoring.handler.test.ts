import { beforeEach, describe, expect, it } from "bun:test";
import { MonitoringCliHandler } from "../../../src/cli/handlers/monitoring.handler.ts";
import { createMockedMonitoringStack } from "../../mocks/monitoring.mock.ts";

describe("MonitoringCliHandler", () => {
  let stack: ReturnType<typeof createMockedMonitoringStack>;
  let handler: MonitoringCliHandler;

  beforeEach(() => {
    stack = createMockedMonitoringStack();
    handler = new MonitoringCliHandler(stack.controller);
  });

  it("prints the open sessions as JSON", async () => {
    const session = await stack.sessions.controller.createSession({});
    const printed = JSON.parse(handler.sessions());
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({ id: session.id, isDefault: true, stats: { sessionId: session.id } });
  });

  it("prints the event stats as JSON", () => {
    stack.eventManager.update({ type: "test", time: new Date(), description: "x" });
    expect(JSON.parse(handler.events())).toMatchObject({ received: 1, pending: 1, lastSentAt: null });
  });

  it("says so when no error was logged", async () => {
    expect(await handler.errors()).toBe("No errors in /tmp/agent-test.log.");
  });

  it("prints the log file and the tail of its errors", async () => {
    stack.logger.error("boom");
    const [header, line] = (await handler.errors()).split("\n");
    expect(header).toBe("Errors in /tmp/agent-test.log, most recent last:");
    expect(line).toEndWith(" error: boom");
  });
});
