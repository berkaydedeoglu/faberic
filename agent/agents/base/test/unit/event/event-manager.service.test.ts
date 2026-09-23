import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { EventManager } from "../../../src/services/event/event-manager.service.ts";
import { createMockedEventStack, type MockEventSink } from "../../mocks/event-sink.mock.ts";

function updateMany(manager: EventManager, count: number, offset = 0): void {
  for (let i = offset; i < offset + count; i++) {
    manager.update({ type: "test", time: new Date(), description: `event ${i}` });
  }
}

const descriptions = (sink: MockEventSink) => sink.sent.map((event) => event.description);
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `event ${from + i}`);

describe("EventManager", () => {
  let sink: MockEventSink;
  let manager: EventManager;
  let consoleError: ReturnType<typeof spyOn>;

  function setup(events: { batchSize?: number; flushIntervalMs?: number } = {}) {
    ({ sink, manager } = createMockedEventStack(events));
  }

  beforeEach(() => {
    consoleError = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    sink.failuresLeft = 0;
    await manager.stop();
    consoleError.mockRestore();
  });

  it("uses a batch of 50 and a 10 second window by default", () => {
    setup();
    updateMany(manager, 49);
    expect(manager.pending).toBe(49);
    expect(sink.batches).toEqual([]);
  });

  describe("sends as soon as the batch is full", () => {
    it("sends 50 events in one POST, in publish order", async () => {
      setup();
      updateMany(manager, 50);
      await manager.flush();

      expect(sink.batches).toHaveLength(1);
      expect(descriptions(sink)).toEqual(range(0, 50));
      expect(manager.pending).toBe(0);
    });

    it("splits a burst into full batches and keeps the rest for the timer", async () => {
      setup({ flushIntervalMs: 60_000 });
      updateMany(manager, 120);
      await manager.flush();

      expect(sink.batches.map((batch) => batch.length)).toEqual([50, 50, 20]);
      expect(descriptions(sink)).toEqual(range(0, 120));
    });
  });

  describe("sends within the interval when the batch is not full", () => {
    it("sends a partial batch once the interval passes", async () => {
      setup({ flushIntervalMs: 40 });
      updateMany(manager, 3);
      expect(sink.batches).toEqual([]);

      await Bun.sleep(80);
      expect(sink.batches.map((batch) => batch.length)).toEqual([3]);
    });

    it("counts the interval from the first queued event, so later events do not delay it", async () => {
      setup({ flushIntervalMs: 100 });
      updateMany(manager, 1);
      await Bun.sleep(70);
      updateMany(manager, 1, 1);
      await Bun.sleep(70);

      expect(descriptions(sink)).toEqual(range(0, 2));
    });

    it("does nothing while the queue is empty", async () => {
      setup({ flushIntervalMs: 20 });
      await Bun.sleep(50);
      await manager.flush();
      expect(sink.batches).toEqual([]);
    });
  });

  it("never sends two batches at once, so order is preserved with a slow API", async () => {
    setup({ batchSize: 10 });
    sink.delayMs = 15;
    updateMany(manager, 35);
    await manager.flush();
    await manager.flush();

    expect(sink.maxConcurrent).toBe(1);
    expect(descriptions(sink)).toEqual(range(0, 35));
  });

  it("keeps a failed batch at the front of the queue and retries it on the next interval", async () => {
    setup({ batchSize: 5, flushIntervalMs: 40 });
    sink.failuresLeft = 1;
    updateMany(manager, 5);
    await Bun.sleep(0);

    expect(manager.pending).toBe(5);
    expect(consoleError).toHaveBeenCalledWith("event flush failed, will retry: orchestrator down");

    updateMany(manager, 2, 5);
    await Bun.sleep(80);
    await manager.flush();
    expect(descriptions(sink)).toEqual(range(0, 7));
  });

  it("flush rejects when sending fails and keeps the events", async () => {
    setup();
    sink.failuresLeft = 1;
    updateMany(manager, 2);

    await expect(manager.flush()).rejects.toThrow("orchestrator down");
    expect(manager.pending).toBe(2);
  });

  describe("stop", () => {
    it("sends everything still queued", async () => {
      setup({ batchSize: 10, flushIntervalMs: 60_000 });
      updateMany(manager, 25);
      await manager.stop();

      expect(sink.batches.map((batch) => batch.length)).toEqual([10, 10, 5]);
      expect(descriptions(sink)).toEqual(range(0, 25));
      expect(manager.pending).toBe(0);
    });

    it("rejects if the API is down, keeping events and not retrying afterwards", async () => {
      setup({ flushIntervalMs: 20 });
      sink.failuresLeft = Number.POSITIVE_INFINITY;
      updateMany(manager, 3);

      await expect(manager.stop()).rejects.toThrow("orchestrator down");
      expect(manager.pending).toBe(3);

      await Bun.sleep(50);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});
