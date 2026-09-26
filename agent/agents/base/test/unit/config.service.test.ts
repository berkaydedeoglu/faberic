import { describe, expect, it } from "bun:test";
import { ConfigService } from "../../src/config/config.service.ts";

describe("ConfigService", () => {
  it("reads process.env when constructed", () => {
    expect(new ConfigService().get()).toEqual(ConfigService.load(process.env));
  });
});

describe("ConfigService.load", () => {
  it("applies defaults when env vars are absent", () => {
    const config = ConfigService.load({});
    expect(config.server.port).toBe(6565);
    expect(config.server.host).toBe("0.0.0.0");
    expect(config.pi.defaultProvider).toBe("anthropic");
    expect(config.pi.defaultThinkingLevel).toBe("medium");
  });

  it("reads values from env vars when present", () => {
    const config = ConfigService.load({
      PORT: "8080",
      HOST: "127.0.0.1",
      PI_DEFAULT_PROVIDER: "openai",
      PI_DEFAULT_MODEL: "gpt-5",
      PI_DEFAULT_THINKING_LEVEL: "high",
    });
    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.pi.defaultProvider).toBe("openai");
    expect(config.pi.defaultModel).toBe("gpt-5");
    expect(config.pi.defaultThinkingLevel).toBe("high");
  });

  it("reads the orchestrator API from env and leaves it unset otherwise", () => {
    expect(ConfigService.load({}).orchestrator).toEqual({ apiUrl: undefined, apiToken: undefined });
    expect(
      ConfigService.load({ ORCHESTRATOR_API_URL: "https://orchestrator/events", ORCHESTRATOR_API_TOKEN: "t" }).orchestrator,
    ).toEqual({ apiUrl: "https://orchestrator/events", apiToken: "t" });
  });

  it("keeps the workspace at ~/.faberic/workspace, whatever the environment says", () => {
    expect(ConfigService.load({ HOME: "/home/me" }).workspace).toEqual({ dir: "/home/me/.faberic/workspace" });
    expect(ConfigService.load({ HOME: "/home/me", WORKSPACE_DIR: "/srv/workspace" }).workspace).toEqual({
      dir: "/home/me/.faberic/workspace",
    });
  });

  it("clones three repositories at a time", () => {
    expect(ConfigService.load({}).environment).toEqual({ cloneConcurrency: 3 });
  });

  it("logs info and up to the console and errors to ~/.faberic/logs/agent.log by default", () => {
    expect(ConfigService.load({ HOME: "/home/me" }).logging).toEqual({
      consoleLevel: "info",
      fileLevel: "error",
      file: "/home/me/.faberic/logs/agent.log",
    });
  });

  it("reads the console level, the file level, and the file from separate variables", () => {
    expect(
      ConfigService.load({ LOG_CONSOLE_LEVEL: "warn", LOG_FILE_LEVEL: "debug", LOG_FILE: "/var/log/agent.log" }).logging,
    ).toEqual({ consoleLevel: "warn", fileLevel: "debug", file: "/var/log/agent.log" });
    expect(() => ConfigService.load({ LOG_CONSOLE_LEVEL: "verbose" })).toThrow('Invalid value for LOG_CONSOLE_LEVEL: "verbose"');
    expect(() => ConfigService.load({ LOG_FILE_LEVEL: "verbose" })).toThrow('Invalid value for LOG_FILE_LEVEL: "verbose"');
  });

  it("serves the last 600 characters of the error lines found in the last 64 KiB of the log file", () => {
    expect(ConfigService.load({}).monitoring).toEqual({ errorLogChars: 600, errorLogScanBytes: 64 * 1024 });
  });

  it("batches events by 50 or every 10 seconds", () => {
    expect(ConfigService.load({}).events).toEqual({ batchSize: 50, flushIntervalMs: 10_000 });
  });

  it("throws on an invalid port", () => {
    expect(() => ConfigService.load({ PORT: "not-a-number" })).toThrow();
  });

  it("throws on an invalid thinking level", () => {
    expect(() => ConfigService.load({ PI_DEFAULT_THINKING_LEVEL: "ultra" })).toThrow();
  });
});
