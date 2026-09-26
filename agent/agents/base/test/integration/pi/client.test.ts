import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { ConfigService } from "../../../src/config/config.service.ts";
import { PiSessionClient } from "../../../src/utils/clients/pi/client.ts";
import { UnavailableError } from "../../../src/utils/errors/app.errors.ts";
import {
  MissingCredentialsError,
  SessionNotFoundError,
  UnknownModelError,
} from "../../../src/utils/errors/session.errors.ts";

const AUTH_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN", "OPENAI_API_KEY"];

const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "anthropic-messages" as const,
    provider: "anthropic" as const,
    model: "claude-opus-4-5",
    usage,
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

function seedSession(cwd: string, sessionDir: string, { savedModel }: { savedModel: boolean }): string {
  const sm = SessionManager.create(cwd, sessionDir);
  if (savedModel) sm.appendModelChange("anthropic", "claude-opus-4-5");
  sm.appendMessage({ role: "user", content: "remember banana", timestamp: Date.now() });
  sm.appendMessage(assistant("Noted: banana."));
  const bash = sm.appendMessage({
    role: "bashExecution",
    command: "ls",
    output: "a.txt",
    exitCode: 0,
    cancelled: false,
    truncated: false,
    timestamp: Date.now(),
  });
  sm.appendCompaction("earlier chat about bananas", bash, 100);
  sm.appendMessage({ role: "user", content: "after compaction", timestamp: Date.now() });
  sm.appendMessage(assistant("ok"));
  return sm.getSessionId();
}

describe("PiSessionClient against the real pi SDK (offline)", () => {
  let dir: string;
  let savedEnv: Record<string, string | undefined>;

  const workspace = () => join(dir, "workspace");

  function client(env: Record<string, string> = {}): PiSessionClient {
    const config = ConfigService.load({
      PI_AGENT_DIR: dir,
      PI_AUTH_PATH: join(dir, "auth.json"),
      PI_MODELS_PATH: join(dir, "models.json"),
      PI_SESSION_DIR: join(dir, "sessions"),
      ...env,
    });
    return new PiSessionClient({ get: () => ({ ...config, workspace: { dir: workspace() } }) } as ConfigService);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-base-pi-"));
    savedEnv = Object.fromEntries(AUTH_ENV.map((key) => [key, process.env[key]]));
    for (const key of AUTH_ENV) delete process.env[key];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  describe("preflight", () => {
    it("warns when the default provider has no credentials", async () => {
      expect(await client().preflight()).toEqual([
        'No credentials for default provider "anthropic". Prompts will fail until an API key is set or you log in with the pi CLI.',
      ]);
    });

    it("is quiet once an API key is set in the environment", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-test";
      expect(await client().preflight()).toEqual([]);
    });

    it("warns about a default model missing from the catalog", async () => {
      const warnings = await client({ PI_DEFAULT_MODEL: "no-such-model" }).preflight();
      expect(warnings[0]).toBe('Default model "no-such-model" not found for provider "anthropic" (PI_DEFAULT_MODEL).');
    });

    it("warns only once about an unknown default provider", async () => {
      expect(await client({ PI_DEFAULT_PROVIDER: "no-such-provider" }).preflight()).toEqual([
        'Unknown default provider "no-such-provider" (PI_DEFAULT_PROVIDER).',
      ]);
    });
  });

  describe("prompting without credentials", () => {
    it("fails fast with MissingCredentialsError instead of reaching the provider", async () => {
      const pi = client();
      const session = await pi.createSession({});

      const attempt = pi.prompt(session, "hello");
      await expect(attempt).rejects.toThrow(MissingCredentialsError);
      await expect(pi.followUp(session, "hello")).rejects.toThrow(UnavailableError);
      expect(pi.getMessages(session)).toEqual([]);
      pi.disposeSession(session);
    });
  });

  describe("stored sessions", () => {
    const sessionDir = () => join(dir, "sessions");

    it("lists only the sessions of the workspace", async () => {
      const id = seedSession(workspace(), sessionDir(), { savedModel: true });
      seedSession(join(dir, "elsewhere"), sessionDir(), { savedModel: true });

      const stored = await client().listSessions();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id, firstMessage: "remember banana" });
      expect(stored[0]!.messageCount).toBeGreaterThan(0);
      expect(stored[0]!.modifiedAt).toBeGreaterThanOrEqual(stored[0]!.createdAt);
    });

    it("continues a session, restoring its saved model and flattening every message kind", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-test";
      const id = seedSession(workspace(), sessionDir(), { savedModel: true });
      const pi = client();

      const session = await pi.continueSession({ sessionId: id });
      expect(session.id).toBe(id);
      expect(pi.getModel(session)).toMatchObject({ provider: "anthropic", id: "claude-opus-4-5" });

      const messages = pi.getMessages(session).map(({ role, text }) => ({ role, text }));
      expect(messages).toContainEqual({ role: "compactionSummary", text: "earlier chat about bananas" });
      expect(messages).toContainEqual({ role: "bashExecution", text: "$ ls\na.txt" });
      expect(messages).toContainEqual({ role: "user", text: "after compaction" });
      expect(messages).toContainEqual({ role: "assistant", text: "ok" });

      expect(pi.getSessionStats(session)).toMatchObject({ sessionId: id, assistantMessages: 2 });
      pi.disposeSession(session);
    });

    it("falls back to the configured default model when the session saved none", async () => {
      const id = seedSession(workspace(), sessionDir(), { savedModel: false });
      const pi = client();
      const session = await pi.continueSession({ sessionId: id });
      expect(pi.getModel(session)).toMatchObject({ provider: "anthropic", id: "claude-sonnet-4-5" });
      pi.disposeSession(session);
    });

    it("does not continue sessions of other directories, and rejects unknown ids", async () => {
      const elsewhere = seedSession(join(dir, "elsewhere"), sessionDir(), { savedModel: true });
      const pi = client();

      await expect(pi.continueSession({ sessionId: elsewhere })).rejects.toThrow(SessionNotFoundError);
      await expect(pi.continueSession({ sessionId: "missing" })).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe("active session operations", () => {
    it("rejects unknown models on create and on switch", async () => {
      const pi = client();
      await expect(pi.createSession({ model: "no-such-model" })).rejects.toThrow(UnknownModelError);

      const session = await pi.createSession({});
      await expect(pi.setModel(session, "anthropic", "no-such-model")).rejects.toThrow(UnknownModelError);
      pi.disposeSession(session);
    });

    it("refuses to switch to a model whose provider has no credentials", async () => {
      const pi = client();
      const session = await pi.createSession({});
      await expect(pi.setModel(session, "anthropic", "claude-opus-4-5")).rejects.toThrow(MissingCredentialsError);
      expect(pi.getModel(session)?.id).toBe("claude-sonnet-4-5");
      pi.disposeSession(session);
    });

    it("switches the model when the provider has credentials", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-test";
      const pi = client();
      const session = await pi.createSession({});
      expect(await pi.setModel(session, "anthropic", "claude-opus-4-5")).toMatchObject({ id: "claude-opus-4-5" });
      expect(pi.getModel(session)?.id).toBe("claude-opus-4-5");
      pi.disposeSession(session);
    });

    it("reads and clamps thinking levels to what the model supports", async () => {
      const pi = client();
      const session = await pi.createSession({ thinkingLevel: "low" });
      const available = pi.getAvailableThinkingLevels(session);

      expect(pi.getThinkingLevel(session)).toBe("low");
      expect(available).toContain("off");
      expect(available).toContain(pi.setThinkingLevel(session, "max"));
      pi.disposeSession(session);
    });

    it("aborts an idle session and forgets it once disposed", async () => {
      const pi = client();
      const session = await pi.createSession({});

      expect(pi.isStreaming(session)).toBe(false);
      await pi.abortSession(session);
      pi.disposeSession(session);
      expect(() => pi.getModel(session)).toThrow("No active pi session");
    });

    it("lists available models only for providers with credentials", async () => {
      expect(await client().listAvailableModels("anthropic")).toEqual([]);

      process.env.ANTHROPIC_API_KEY = "sk-test";
      const models = await client().listAvailableModels("anthropic");
      expect(models.map((model) => model.id)).toContain("claude-sonnet-4-5");
    });
  });
});
