import { beforeEach, describe, expect, it } from "bun:test";
import { reportAttach } from "../../../src/cli/attach.ts";

describe("reportAttach", () => {
  let out: string[];
  let err: string[];
  const output = { out: (text: string) => out.push(text), err: (text: string) => err.push(text) };

  beforeEach(() => {
    out = [];
    err = [];
  });

  it("prints which session was opened to stderr", async () => {
    await reportAttach(async () => "Created session abc.", output);
    expect(err).toEqual(["Created session abc."]);
    expect(out).toEqual([]);
  });

  it("turns a failure into a warning so the REPL still starts", async () => {
    await reportAttach(async () => {
      throw new Error('Unknown model "nope" for provider "anthropic"');
    }, output);
    expect(err).toEqual(['warning: could not open a session: Unknown model "nope" for provider "anthropic"']);
  });
});
