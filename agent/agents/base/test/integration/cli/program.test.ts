import { beforeEach, describe, expect, it } from "bun:test";
import { SessionCliHandler } from "../../../src/cli/handlers/session.handler.ts";
import { createProgram, executeCli } from "../../../src/cli/program.ts";
import type { ServeOptions } from "../../../src/http/server.ts";
import { createMockedSessionStack } from "../../mocks/session-sdk.mock.ts";

describe("CLI (program -> handler -> controller -> services, mocked SDK)", () => {
  let session: SessionCliHandler;
  let out: string[];
  let err: string[];
  let served: ServeOptions[];

  const output = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
  };

  function run(line: string): Promise<number> {
    const program = createProgram({
      session,
      serve: (options) => served.push(options),
      defaults: { port: 6565, host: "0.0.0.0" },
      output,
    });
    return executeCli(program, line.split(" "), output);
  }

  beforeEach(() => {
    session = new SessionCliHandler(createMockedSessionStack().controller);
    out = [];
    err = [];
    served = [];
  });

  it("keeps state across commands in the same process", async () => {
    expect(await run("session create --provider openai --model gpt-5 --thinking-level low")).toBe(0);
    expect(await run("session get-model")).toBe(0);
    expect(JSON.parse(out.at(-1)!)).toEqual({ provider: "openai", id: "gpt-5", name: "gpt-5" });

    expect(await run("session prompt list the files")).toBe(0);
    expect(out.at(-1)).toBe("echo: list the files");

    expect(await run("session follow-up and more")).toBe(0);
    expect(await run("session messages")).toBe(0);
    expect(out.at(-1)!.split("\n")).toHaveLength(4);

    expect(await run("session stats")).toBe(0);
    expect(JSON.parse(out.at(-1)!).totalMessages).toBe(4);
  });

  it("attaches to a session on first use, so a single command is enough", async () => {
    expect(await run("session prompt hi")).toBe(0);
    expect(out).toEqual(["echo: hi"]);
    expect(await run("session get")).toBe(0);
    expect(JSON.parse(out.at(-1)!).status).toBe("idle");
  });

  it("a fresh CLI process resumes the conversation of the previous one", async () => {
    const disk = createMockedSessionStack().sdk;
    session = new SessionCliHandler(createMockedSessionStack(disk).controller);
    expect(await run("session prompt remember me")).toBe(0);

    session = new SessionCliHandler(createMockedSessionStack(disk).controller);
    expect(await run("session messages")).toBe(0);
    expect(out.at(-1)).toBe("[user] remember me\n[assistant] echo: remember me");
  });

  it("binds every session operation", async () => {
    await run("session create");
    const commands = [
      "session get",
      "session set-model anthropic claude-sonnet-4-5",
      "session list-models --provider openai",
      "session set-thinking-level high",
      "session get-thinking-level",
      "session abort",
      "session destroy",
    ];
    for (const command of commands) {
      expect(await run(command)).toBe(0);
    }
    expect(err).toEqual([]);
    expect(JSON.parse(out.at(-1)!)).toEqual({ status: "disposed" });
  });

  it("does not leak options between runs", async () => {
    await run("session create");
    expect(await run("session create --force")).toBe(0);
    expect(await run("session create")).toBe(1);
    expect(err.at(-1)).toContain("already active");
  });

  it("prints domain errors and returns exit code 1", async () => {
    expect(await run("session destroy")).toBe(1);
    expect(err).toEqual(["error: No active session. Create one first."]);

    await run("session create");
    expect(await run("session set-thinking-level ultra")).toBe(1);
    expect(err.at(-1)).toContain('"thinkingLevel" must be one of');
  });

  it("prints a credentials error for prompts and keeps the session usable", async () => {
    await run("session create --provider mistral --model mistral-large");
    expect(await run("session prompt hi")).toBe(1);
    expect(err.at(-1)).toBe(
      'error: No credentials configured for provider "mistral". Set its API key in .env or log in with the pi CLI.',
    );
    expect(await run("session set-model openai gpt-5")).toBe(0);
    expect(await run("session prompt hi")).toBe(0);
    expect(out.at(-1)).toBe("echo: hi");
  });

  it("prints help to stdout and exits cleanly", async () => {
    expect(await run("session --help")).toBe(0);
    expect(out.at(-1)).toContain("Usage: agent session");
    expect(out.at(-1)).toContain("continue [options] <sessionId>");
    expect(err).toEqual([]);
  });

  it("introduces every session command and its options in the top-level help", async () => {
    expect(await run("help")).toBe(0);
    const help = out.at(-1)!;
    const commands = [
      "create",
      "list",
      "continue <sessionId>",
      "get",
      "abort",
      "destroy",
      "get-model",
      "set-model <provider> <model>",
      "list-models",
      "get-thinking-level",
      "set-thinking-level <level>",
      "stats",
      "messages",
      "prompt <text...>",
      "follow-up <text...>",
    ];
    for (const command of commands) {
      expect(help).toMatch(new RegExp(`^  session ${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`, "m"));
    }
    expect(help).toContain("--thinking-level <level>");
    expect(help).toContain("one of off, minimal, low, medium, high, xhigh, max");
    expect(help).toContain("--all");
    expect(help).not.toContain("--help  ");
    expect(await run("--help")).toBe(0);
    expect(out.at(-1)).toBe(help);
  });

  it("rejects unknown commands and missing arguments", async () => {
    expect(await run("session nope")).not.toBe(0);
    expect(await run("session set-model openai")).not.toBe(0);
    expect(err.length).toBeGreaterThan(0);
  });

  it("serve uses config defaults, overridable by flags", async () => {
    expect(await run("serve")).toBe(0);
    expect(await run("serve --port 8080 --host 127.0.0.1")).toBe(0);
    expect(served).toEqual([
      { port: 6565, host: "0.0.0.0" },
      { port: 8080, host: "127.0.0.1" },
    ]);
    expect(out.at(-1)).toBe("listening on http://127.0.0.1:8080");
  });

  it("serve rejects an invalid port", async () => {
    expect(await run("serve --port abc")).toBe(1);
    expect(served).toEqual([]);
  });

  it("lists stored sessions and continues one by id", async () => {
    expect(await run("session list")).toBe(0);
    expect(out.at(-1)).toBe("No sessions found.");

    await run("session create");
    const { id } = JSON.parse(out.at(-1)!);
    await run("session prompt remember me");
    await run("session destroy");

    expect(await run("session list")).toBe(0);
    expect(out.at(-1)).toStartWith(`${id}  `);
    expect(out.at(-1)).toContain("2 msgs");
    expect(await run("session list --cwd /elsewhere")).toBe(0);
    expect(out.at(-1)).toBe("No sessions found.");
    expect(await run("session list --all")).toBe(0);
    expect(out.at(-1)).toContain(id);

    expect(await run(`session continue ${id}`)).toBe(0);
    expect(JSON.parse(out.at(-1)!).id).toBe(id);
    expect(await run("session messages")).toBe(0);
    expect(out.at(-1)).toBe("[user] remember me\n[assistant] echo: remember me");
  });

  it("continue needs --force to replace the active session and reports unknown ids", async () => {
    await run("session create");
    const { id } = JSON.parse(out.at(-1)!);
    await run("session prompt hi");
    await run("session create --force");

    expect(await run(`session continue ${id}`)).toBe(1);
    expect(err.at(-1)).toContain("already active");
    expect(await run(`session continue ${id} --force`)).toBe(0);

    expect(await run("session continue missing --force")).toBe(1);
    expect(err.at(-1)).toBe('error: No stored session with id "missing"');
    expect(await run("session get")).toBe(0);
    expect(JSON.parse(out.at(-1)!).id).toBe(id);

    expect(await run("session continue")).not.toBe(0);
  });
});
