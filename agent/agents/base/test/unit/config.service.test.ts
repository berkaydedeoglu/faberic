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

  it("throws on an invalid port", () => {
    expect(() => ConfigService.load({ PORT: "not-a-number" })).toThrow();
  });

  it("throws on an invalid thinking level", () => {
    expect(() => ConfigService.load({ PI_DEFAULT_THINKING_LEVEL: "ultra" })).toThrow();
  });
});
