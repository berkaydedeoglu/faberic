import { describe, expect, it } from "bun:test";
import { mapWithConcurrency } from "../../../src/utils/concurrency.ts";

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once and keeps the input order", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async (delay, index) => {
      running++;
      peak = Math.max(peak, running);
      await Bun.sleep(delay);
      running--;
      return `${index}:${delay}`;
    });
    expect(peak).toBe(2);
    expect(results).toEqual(["0:30", "1:10", "2:20", "3:5", "4:15"]);
  });

  it("handles an empty list and a limit above the item count", async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 10, async (n) => n * 2)).toEqual([2, 4]);
  });
});
