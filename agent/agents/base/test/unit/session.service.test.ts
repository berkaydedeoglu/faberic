import { beforeEach, describe, expect, it } from "bun:test";
import { SessionManagerService } from "../../src/services/session/session-manager.service.ts";
import { SessionService } from "../../src/services/session/session.service.ts";
import { MockSessionSdk } from "../mocks/session-sdk.mock.ts";

describe("SessionService", () => {
  let mockSdk: MockSessionSdk;
  let manager: SessionManagerService;
  let service: SessionService;

  beforeEach(async () => {
    mockSdk = new MockSessionSdk();
    manager = new SessionManagerService(mockSdk);
    service = new SessionService(mockSdk, manager);
    await manager.createSession({ provider: "anthropic", model: "claude-sonnet-4-5", thinkingLevel: "low" });
  });

  it("round-trips model get/set", async () => {
    expect(service.getModel()).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5", name: "claude-sonnet-4-5" });
    const updated = await service.setModel("openai", "gpt-5");
    expect(updated).toEqual({ provider: "openai", id: "gpt-5", name: "gpt-5" });
    expect(service.getModel()).toEqual(updated);
  });

  it("round-trips thinking level get/set", () => {
    expect(service.getThinkingLevel()).toBe("low");
    const effective = service.setThinkingLevel("xhigh");
    expect(effective).toBe("xhigh");
    expect(service.getThinkingLevel()).toBe("xhigh");
  });

  it("exposes what the current model actually supports", () => {
    expect(service.getAvailableThinkingLevels()).toEqual(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
  });

  it("clamps to the nearest supported level instead of throwing, like the real SDK", () => {
    const handle = manager.getActiveSession();
    mockSdk.sessions.get(handle.id)!.availableThinkingLevels = ["off", "minimal", "low", "medium", "high"];

    const effective = service.setThinkingLevel("max");
    expect(effective).toBe("high");
    expect(service.getThinkingLevel()).toBe("high");
  });

  it("prompt() appends messages and updates stats", async () => {
    await service.prompt("hello");
    const messages = service.getMessages();
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1]?.text).toBe("echo: hello");

    const stats = service.getStats();
    expect(stats.userMessages).toBe(1);
    expect(stats.assistantMessages).toBe(1);
    expect(stats.totalMessages).toBe(2);
  });

  it("followUp() behaves like prompt()", async () => {
    await service.followUp("second");
    expect(service.getMessages()).toHaveLength(2);
  });

  it("reports streaming state while a prompt is in flight", async () => {
    mockSdk.promptDelay = 20;
    const pending = service.prompt("slow");
    expect(service.isStreaming()).toBe(true);
    await pending;
    expect(service.isStreaming()).toBe(false);
  });

  it("propagates NoActiveSessionError when there is no active session", async () => {
    await manager.destroyActiveSession();
    expect(() => service.getModel()).toThrow();
  });
});
