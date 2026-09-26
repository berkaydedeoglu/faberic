import { beforeEach, describe, expect, it } from "bun:test";
import { stopEvents } from "../../../src/cli/shutdown.ts";
import { createMockedEventStack } from "../../mocks/event-sink.mock.ts";

describe("stopEvents", () => {
  let err: string[];
  const output = { out: () => {}, err: (text: string) => err.push(text) };

  beforeEach(() => {
    err = [];
  });

  it("sends the events still queued before the process exits", async () => {
    const { sink, manager } = createMockedEventStack();
    manager.update({ type: "test", sessionId: "s1", time: new Date(), description: "last words" });

    await stopEvents(() => manager.stop(), output);
    expect(sink.sent.map((event) => event.description)).toEqual(["last words"]);
    expect(err).toEqual([]);
  });

  it("is a no-op when nothing was queued", async () => {
    const { sink, manager } = createMockedEventStack();
    await stopEvents(() => manager.stop(), output);
    expect(sink.batches).toEqual([]);
  });

  it("warns instead of failing the exit when events cannot be sent", async () => {
    const { sink, manager } = createMockedEventStack();
    sink.failuresLeft = Number.POSITIVE_INFINITY;
    manager.update({ type: "test", sessionId: "s1", time: new Date(), description: "lost" });

    await stopEvents(() => manager.stop(), output);
    expect(err).toEqual(["warning: could not send pending events: orchestrator down"]);
  });
});
