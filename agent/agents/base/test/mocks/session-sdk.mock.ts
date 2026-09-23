import {
  type ContinueSessionOptions,
  type CreateSessionOptions,
  type ListSessionsOptions,
  type ModelInfo,
  type SessionMessage,
  type SessionStats,
  type StoredSession,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "../../src/models/index.ts";
import { SessionController } from "../../src/controllers/session.controller.ts";
import { SessionManagerService } from "../../src/services/session/session-manager.service.ts";
import { SessionService } from "../../src/services/session/session.service.ts";
import type { PiSessionHandle, SessionSdk } from "../../src/utils/clients/pi/client.ts";
import { MissingCredentialsError, SessionNotFoundError } from "../../src/utils/errors/session.errors.ts";

interface MockSession {
  cwd: string;
  createdAt: number;
  modifiedAt: number;
  model: ModelInfo;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  messages: SessionMessage[];
  streaming: boolean;
  aborted: boolean;
  disposed: boolean;
}

function clampThinkingLevel(level: ThinkingLevel, available: readonly ThinkingLevel[]): ThinkingLevel {
  if (available.includes(level)) return level;
  const target = THINKING_LEVELS.indexOf(level);
  let closest = available[0] as ThinkingLevel;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of available) {
    const distance = Math.abs(THINKING_LEVELS.indexOf(candidate) - target);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export class MockSessionSdk implements SessionSdk {
  readonly sessions = new Map<string, MockSession>();
  readonly stored = new Map<string, MockSession>();
  private seq = 0;
  promptDelay = 0;
  preflightWarnings: string[] = [];
  credentialedProviders = new Set(["anthropic", "openai"]);
  availableModels: ModelInfo[] = [
    { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    { provider: "openai", id: "gpt-5", name: "GPT-5" },
  ];

  async preflight(): Promise<string[]> {
    return [...this.preflightWarnings];
  }

  async createSession(options: CreateSessionOptions): Promise<PiSessionHandle> {
    const id = `mock_${this.seq++}`;
    const now = Date.now();
    const session: MockSession = {
      cwd: options.cwd ?? process.cwd(),
      createdAt: now,
      modifiedAt: now,
      model: { provider: options.provider ?? "anthropic", id: options.model ?? "claude-sonnet-4-5", name: options.model ?? "claude-sonnet-4-5" },
      thinkingLevel: options.thinkingLevel ?? "medium",
      availableThinkingLevels: [...THINKING_LEVELS],
      messages: [],
      streaming: false,
      aborted: false,
      disposed: false,
    };
    this.stored.set(id, session);
    this.sessions.set(id, session);
    return { id, createdAt: now };
  }

  private persisted(): [string, MockSession][] {
    return [...this.stored.entries()].filter(([, session]) => session.messages.some((m) => m.role === "assistant"));
  }

  async continueSession({ sessionId }: ContinueSessionOptions): Promise<PiSessionHandle> {
    const session = new Map(this.persisted()).get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    session.disposed = false;
    this.sessions.set(sessionId, session);
    return { id: sessionId, createdAt: session.createdAt };
  }

  async listSessions({ cwd = process.cwd(), all = false }: ListSessionsOptions): Promise<StoredSession[]> {
    return this.persisted()
      .filter(([, session]) => all || session.cwd === cwd)
      .map(([id, session]) => ({
        id,
        cwd: session.cwd,
        name: undefined,
        createdAt: session.createdAt,
        modifiedAt: session.modifiedAt,
        messageCount: session.messages.length,
        firstMessage: session.messages[0]?.text ?? "",
      }));
  }

  private resolve(handle: PiSessionHandle): MockSession {
    const session = this.sessions.get(handle.id);
    if (!session) throw new Error(`No mock session for handle "${handle.id}"`);
    return session;
  }

  async abortSession(handle: PiSessionHandle): Promise<void> {
    this.resolve(handle).aborted = true;
    this.resolve(handle).streaming = false;
  }

  disposeSession(handle: PiSessionHandle): void {
    this.resolve(handle).disposed = true;
    this.sessions.delete(handle.id);
  }

  getModel(handle: PiSessionHandle): ModelInfo | undefined {
    return this.resolve(handle).model;
  }

  async setModel(handle: PiSessionHandle, provider: string, modelId: string): Promise<ModelInfo> {
    if (!this.credentialedProviders.has(provider)) {
      throw new MissingCredentialsError(provider);
    }
    const info: ModelInfo = { provider, id: modelId, name: modelId };
    this.resolve(handle).model = info;
    return info;
  }

  async listAvailableModels(provider?: string): Promise<ModelInfo[]> {
    return provider ? this.availableModels.filter((m) => m.provider === provider) : this.availableModels;
  }

  getThinkingLevel(handle: PiSessionHandle): ThinkingLevel {
    return this.resolve(handle).thinkingLevel;
  }

  setThinkingLevel(handle: PiSessionHandle, level: ThinkingLevel): ThinkingLevel {
    const session = this.resolve(handle);
    session.thinkingLevel = clampThinkingLevel(level, session.availableThinkingLevels);
    return session.thinkingLevel;
  }

  getAvailableThinkingLevels(handle: PiSessionHandle): ThinkingLevel[] {
    return [...this.resolve(handle).availableThinkingLevels];
  }

  getSessionStats(handle: PiSessionHandle): SessionStats {
    const session = this.resolve(handle);
    const userMessages = session.messages.filter((m) => m.role === "user").length;
    const assistantMessages = session.messages.filter((m) => m.role === "assistant").length;
    return {
      sessionId: handle.id,
      userMessages,
      assistantMessages,
      toolCalls: 0,
      toolResults: 0,
      totalMessages: session.messages.length,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      cost: 0,
    };
  }

  async prompt(handle: PiSessionHandle, text: string): Promise<void> {
    const session = this.resolve(handle);
    if (!this.credentialedProviders.has(session.model.provider)) {
      throw new MissingCredentialsError(session.model.provider);
    }
    session.streaming = true;
    if (this.promptDelay > 0) await new Promise((r) => setTimeout(r, this.promptDelay));
    session.messages.push({ role: "user", text, timestamp: Date.now() });
    session.messages.push({ role: "assistant", text: `echo: ${text}`, timestamp: Date.now() });
    session.modifiedAt = Date.now();
    session.streaming = false;
  }

  async followUp(handle: PiSessionHandle, text: string): Promise<void> {
    await this.prompt(handle, text);
  }

  getMessages(handle: PiSessionHandle): SessionMessage[] {
    return [...this.resolve(handle).messages];
  }

  isStreaming(handle: PiSessionHandle): boolean {
    return this.resolve(handle).streaming;
  }
}

export function createMockedSessionStack(sdk = new MockSessionSdk()) {
  const manager = new SessionManagerService(sdk);
  const service = new SessionService(sdk, manager);
  const controller = new SessionController(manager, service);
  return { sdk, manager, service, controller };
}
