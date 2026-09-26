import { beforeEach, describe, expect, it } from "bun:test";
import { createMockedMonitoringStack } from "../../mocks/monitoring.mock.ts";

describe("MonitoringService / MonitoringController", () => {
  let stack: ReturnType<typeof createMockedMonitoringStack>;

  beforeEach(() => {
    stack = createMockedMonitoringStack();
  });

  describe("sessions", () => {
    it("is empty without open sessions", () => {
      expect(stack.controller.getSessions()).toEqual([]);
    });

    it("describes every open session, in opening order, with its stats", async () => {
      const first = await stack.sessions.controller.createSession({});
      const second = await stack.sessions.controller.createSession({ provider: "openai", model: "gpt-5" });
      await stack.sessions.controller.prompt({ text: "hi", sessionId: second.id });

      const sessions = stack.controller.getSessions();
      expect(sessions.map((session) => [session.id, session.isDefault])).toEqual([
        [first.id, true],
        [second.id, false],
      ]);
      expect(sessions[1]).toMatchObject({ model: { provider: "openai", id: "gpt-5" }, status: "idle" });
      expect(sessions[1]!.stats).toMatchObject({ sessionId: second.id, totalMessages: 2 });
      expect(sessions[0]!.stats.totalMessages).toBe(0);
    });

    it("drops destroyed sessions", async () => {
      const session = await stack.sessions.controller.createSession({});
      await stack.sessions.controller.destroySession({ sessionId: session.id });
      expect(stack.controller.getSessions()).toEqual([]);
    });
  });

  describe("events", () => {
    it("reports the event manager's counters, including events from sessions", async () => {
      await stack.sessions.controller.createSession({});
      await stack.sessions.controller.prompt({ text: "hi" });
      const stats = stack.controller.getEventStats();
      expect(stats.receivedByType).toMatchObject({ agent_start: 1, agent_end: 1 });
      expect(stats.pending).toBe(stats.received);
      expect(stats.sent).toBe(0);
    });
  });

  describe("errors", () => {
    it("is empty when nothing failed and names the log file", async () => {
      expect(await stack.controller.getErrors()).toEqual({ file: "/tmp/agent-test.log", log: "" });
    });

    it("returns the error lines of the file, oldest first, without other levels", async () => {
      stack.file.write("2026-01-02T03:04:05.000Z warn: not an error");
      stack.logger.error("first");
      stack.logger.error("second", new Error("boom"));

      const { log } = await stack.controller.getErrors();
      expect(log.split("\n").map((line) => line.split(" ").slice(1).join(" "))).toEqual([
        "error: first",
        "error: second: boom",
      ]);
    });

    it("returns only the last errorLogChars characters", async () => {
      for (let i = 0; i < 50; i++) stack.logger.error(`failure number ${i}`);

      const { log } = await stack.controller.getErrors();
      expect(log).toHaveLength(600);
      expect(log).toEndWith("error: failure number 49");
    });

    it("reads only the last errorLogScanBytes of the file and drops the partial first line", async () => {
      stack = createMockedMonitoringStack({ errorLogScanBytes: 100 });
      for (let i = 0; i < 10; i++) stack.logger.error(`failure number ${i}`);

      const lines = (await stack.controller.getErrors()).log.split("\n");
      expect(lines.map((line) => line.split(" ").slice(1).join(" "))).toEqual(["error: failure number 8", "error: failure number 9"]);
    });

    it("includes background failures such as a failed event flush", async () => {
      stack.sink.failuresLeft = 1;
      stack.eventManager.update({ type: "test", time: new Date(), description: "x" });
      // A full batch is flushed in the background; the failure is logged, not thrown.
      for (let i = 0; i < 49; i++) stack.eventManager.update({ type: "test", time: new Date(), description: "x" });
      await Bun.sleep(0);

      expect((await stack.controller.getErrors()).log).toContain("error: event flush failed, will retry: orchestrator down");
      expect(stack.controller.getEventStats().failedBatches).toBe(1);
      await stack.eventManager.stop();
    });
  });
});
