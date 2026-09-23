import { beforeEach, describe, expect, it } from "bun:test";
import { reportPreflight } from "../../../src/cli/preflight.ts";

describe("reportPreflight", () => {
  let out: string[];
  let err: string[];
  const output = { out: (text: string) => out.push(text), err: (text: string) => err.push(text) };

  beforeEach(() => {
    out = [];
    err = [];
  });

  it("prints each warning to stderr and nothing to stdout", async () => {
    await reportPreflight(async () => ["no credentials", "no model"], output);
    expect(err).toEqual(["warning: no credentials", "warning: no model"]);
    expect(out).toEqual([]);
  });

  it("prints nothing when all checks pass", async () => {
    await reportPreflight(async () => [], output);
    expect(err).toEqual([]);
  });

  it("turns a failing check into a warning instead of stopping startup", async () => {
    await reportPreflight(async () => {
      throw new Error("auth.json is corrupt");
    }, output);
    expect(err).toEqual(["warning: preflight check failed: auth.json is corrupt"]);
  });
});
