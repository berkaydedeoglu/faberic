import { describe, expect, it } from "bun:test";
import { PassThrough, Readable } from "node:stream";
import { startRepl, tokenize } from "../../../src/cli/repl.ts";

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("session  get-model")).toEqual(["session", "get-model"]);
  });

  it("keeps quoted text together", () => {
    expect(tokenize(`session prompt "list the files" 'and more'`)).toEqual([
      "session",
      "prompt",
      "list the files",
      "and more",
    ]);
  });

  it("returns nothing for a blank line", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("startRepl", () => {
  async function runRepl(lines: string[]) {
    const executed: string[][] = [];
    const output = new PassThrough();
    let printed = "";
    output.on("data", (chunk) => (printed += chunk));
    await startRepl(
      async (argv) => {
        executed.push(argv);
        return 0;
      },
      Readable.from(lines.map((line) => `${line}\n`)),
      output,
    );
    return { executed, printed };
  }

  it("runs each non-blank line as a command until exit", async () => {
    const { executed, printed } = await runRepl(["session get", "   ", 'session prompt "hi there"', "exit", "session stats"]);
    expect(executed).toEqual([["session", "get"], ["session", "prompt", "hi there"]]);
    expect(printed).toContain('Type "help" for commands');
    expect(printed).toContain("agent> ");
  });

  it("accepts quit as well", async () => {
    expect((await runRepl(["quit", "session get"])).executed).toEqual([]);
  });

  it("stops when the input ends", async () => {
    expect((await runRepl(["session get"])).executed).toEqual([["session", "get"]]);
  });
});
