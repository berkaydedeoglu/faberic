import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EnvironmentCliHandler } from "../../../src/cli/handlers/environment.handler.ts";
import { MonitoringCliHandler } from "../../../src/cli/handlers/monitoring.handler.ts";
import { SessionCliHandler } from "../../../src/cli/handlers/session.handler.ts";
import { createProgram, executeCli } from "../../../src/cli/program.ts";
import type { ServeOptions } from "../../../src/http/server.ts";
import { createMockedEnvironmentStack } from "../../mocks/environment.mock.ts";
import { createMockedMonitoringStack } from "../../mocks/monitoring.mock.ts";
import { createMockedSessionStack } from "../../mocks/session-sdk.mock.ts";

describe("CLI (program -> handler -> controller -> services, mocked SDK)", () => {
  let session: SessionCliHandler;
  let environment: ReturnType<typeof createMockedEnvironmentStack>;
  let monitoring: ReturnType<typeof createMockedMonitoringStack>;
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
      environment: new EnvironmentCliHandler(environment.controller),
      monitoring: new MonitoringCliHandler(monitoring.controller),
      serve: (options) => served.push(options),
      defaults: { port: 6565, host: "0.0.0.0" },
      output,
    });
    return executeCli(program, line.split(" "), output);
  }

  beforeEach(() => {
    monitoring = createMockedMonitoringStack();
    session = new SessionCliHandler(monitoring.sessions.controller);
    environment = createMockedEnvironmentStack();
    out = [];
    err = [];
    served = [];
  });

  afterEach(() => environment.cleanup());

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
    expect(JSON.parse(out.at(-1)!)).toEqual({ id: expect.any(String), status: "disposed" });
  });

  it("does not leak options between runs", async () => {
    expect(await run("session create --provider openai --model gpt-5")).toBe(0);
    expect(JSON.parse(out.at(-1)!).model.id).toBe("gpt-5");
    expect(await run("session create")).toBe(0);
    expect(JSON.parse(out.at(-1)!).model.id).toBe("claude-sonnet-4-5");
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
    expect(out.at(-1)).toContain("continue <sessionId>");
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
    expect(help).not.toContain("--cwd");
    expect(help).not.toContain("--all");
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
    expect(await run("session list --cwd /elsewhere")).not.toBe(0);
    expect(await run("session create --cwd /elsewhere")).not.toBe(0);
    expect(await run(`session continue ${id} --cwd /elsewhere`)).not.toBe(0);

    expect(await run(`session continue ${id}`)).toBe(0);
    expect(JSON.parse(out.at(-1)!).id).toBe(id);
    expect(await run("session messages")).toBe(0);
    expect(out.at(-1)).toBe("[user] remember me\n[assistant] echo: remember me");
  });

  it("continue opens the session next to the default one and reports unknown ids", async () => {
    await run("session create");
    const { id } = JSON.parse(out.at(-1)!);
    await run("session prompt hi");
    await run("session destroy");
    await run("session create");
    const { id: other } = JSON.parse(out.at(-1)!);

    expect(await run(`session continue ${id}`)).toBe(0);
    expect(await run("session list-open")).toBe(0);
    expect(JSON.parse(out.at(-1)!).map((session: { id: string }) => session.id)).toEqual([other, id]);

    expect(await run("session continue missing")).toBe(1);
    expect(err.at(-1)).toBe('error: No stored session with id "missing"');
    expect(await run("session get")).toBe(0);
    expect(JSON.parse(out.at(-1)!).id).toBe(other);

    expect(await run("session continue")).not.toBe(0);
  });

  it("targets a session with --session and switches the default with set-default", async () => {
    await run("session create");
    const { id: first } = JSON.parse(out.at(-1)!);
    await run("session create --provider openai --model gpt-5");
    const { id: second } = JSON.parse(out.at(-1)!);

    expect(await run(`session prompt hello --session ${second}`)).toBe(0);
    expect(await run(`session messages --session ${second}`)).toBe(0);
    expect(out.at(-1)).toBe("[user] hello\n[assistant] echo: hello");
    expect(await run("session stats")).toBe(0);
    expect(JSON.parse(out.at(-1)!)).toMatchObject({ sessionId: first, totalMessages: 0 });

    expect(await run(`session set-default ${second}`)).toBe(0);
    expect(await run("session get-model")).toBe(0);
    expect(JSON.parse(out.at(-1)!).id).toBe("gpt-5");

    expect(await run(`session destroy --session ${second}`)).toBe(0);
    expect(await run("session get")).toBe(0);
    expect(JSON.parse(out.at(-1)!)).toMatchObject({ id: first, isDefault: true });

    expect(await run("session get --session missing")).toBe(1);
    expect(err.at(-1)).toBe('error: Session "missing" is not open. Create or continue it first.');
    expect(await run("session set-default missing")).toBe(1);
  });

  describe("environment", () => {
    it("clones a repository into the workspace", async () => {
      expect(await run("environment clone https://example.com/org/app.git")).toBe(0);
      expect(JSON.parse(out.at(-1)!)).toEqual({
        url: "https://example.com/org/app.git",
        path: join(environment.workspace, "app"),
        status: "cloned",
      });
      expect(await run("environment clone https://example.com/org/app.git --directory apps/web --depth 1")).toBe(0);
      expect(JSON.parse(out.at(-1)!).path).toBe(join(environment.workspace, "apps", "web"));
      expect(environment.git.clones.map((clone) => clone.options.depth)).toEqual([undefined, 1]);
    });

    it("rejects a depth that is not a positive integer", async () => {
      for (const depth of ["0", "-1", "1.5", "abc"]) {
        expect(await run(`environment clone https://example.com/app --depth ${depth}`)).toBe(1);
        expect(err.at(-1)).toBe('error: "repositories[0].depth" must be a positive integer');
      }
      expect(environment.git.clones).toEqual([]);
    });

    it("writes AGENTS.md from arguments", async () => {
      expect(await run("environment create-agent-md Keep changes small")).toBe(0);
      const { path } = JSON.parse(out.at(-1)!);
      expect(path).toBe(join(environment.workspace, "AGENTS.md"));
      expect(await readFile(path, "utf8")).toBe("Keep changes small");
    });

    it("injects a skill from a file", async () => {
      await environment.service.ensureWorkspace();
      const source = join(environment.workspace, "source.md");
      await writeFile(source, "---\nname: lint\n---\n");
      expect(await run(`environment inject-skill lint --file ${source}`)).toBe(0);
      const { path } = JSON.parse(out.at(-1)!);
      expect(path).toBe(join(environment.workspace, ".pi", "skills", "lint", "SKILL.md"));
      expect(await readFile(path, "utf8")).toBe("---\nname: lint\n---\n");
    });

    it("prints environment errors and returns exit code 1", async () => {
      await run("environment clone https://example.com/app");
      expect(await run("environment clone https://example.com/app")).toBe(1);
      expect(err.at(-1)).toStartWith('error: "');
      expect(err.at(-1)).toEndWith('already exists. Clone into another directory.');
      expect(await run("environment inject-skill Bad content")).toBe(1);
      expect(err.at(-1)).toContain('"name" must be lowercase letters');
      expect(await run("environment create-agent-md")).toBe(1);
      expect(err.at(-1)).toBe('error: "content" must be a non-empty string');
    });

    it("lists the environment commands in the top-level help", async () => {
      expect(await run("help")).toBe(0);
      const help = out.at(-1)!;
      expect(help).toContain("Environment commands:");
      expect(help).toMatch(/^  environment clone <url>\s/m);
      expect(help).toContain("--depth <depth>");
      expect(help).toMatch(/^  environment create-agent-md \[content\.\.\.\]\s/m);
      expect(help).toMatch(/^  environment inject-skill <name> \[content\.\.\.\]\s/m);
      expect(help).toContain("--file <path>");
      expect(help).toContain('Run "environment <command> --help" for details on a single command.');
    });
  });

  describe("monitoring", () => {
    it("shows the sessions opened by earlier commands", async () => {
      expect(await run("session create --provider openai --model gpt-5")).toBe(0);
      expect(await run("session prompt hi")).toBe(0);
      expect(await run("monitoring sessions")).toBe(0);
      const sessions = JSON.parse(out.at(-1)!);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({ model: { provider: "openai", id: "gpt-5" }, stats: { totalMessages: 2 } });
    });

    it("shows the event counters", async () => {
      expect(await run("session prompt hi")).toBe(0);
      expect(await run("monitoring events")).toBe(0);
      expect(JSON.parse(out.at(-1)!)).toMatchObject({ receivedByType: { agent_start: 1, agent_end: 1 }, sent: 0 });
    });

    it("shows the error log", async () => {
      expect(await run("monitoring errors")).toBe(0);
      expect(out.at(-1)).toBe("No errors in /tmp/agent-test.log.");
      monitoring.logger.error("boom");
      expect(await run("monitoring errors")).toBe(0);
      expect(out.at(-1)).toStartWith("Errors in /tmp/agent-test.log, most recent last:\n");
    });

    it("lists the monitoring commands in the top-level help", async () => {
      expect(await run("help")).toBe(0);
      const help = out.at(-1)!;
      expect(help).toContain("Monitoring commands:");
      expect(help).toMatch(/^  monitoring sessions\s/m);
      expect(help).toMatch(/^  monitoring events\s/m);
      expect(help).toMatch(/^  monitoring errors\s/m);
    });
  });
});
