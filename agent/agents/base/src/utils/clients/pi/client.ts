import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  createAgentSession,
  ModelRuntime,
  SessionManager as PiSessionManager,
  type SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../../config/config.service.ts";
import type {
  ContinueSessionOptions,
  CreateSessionOptions,
  ListSessionsOptions,
  ModelInfo,
  SessionMessage,
  SessionStats,
  StoredSession,
  ThinkingLevel,
} from "../../../models/index.ts";
import { MissingCredentialsError, SessionNotFoundError, UnknownModelError } from "../../errors/session.errors.ts";

export interface PiSessionHandle {
  readonly id: string;
  readonly createdAt: number;
}

export interface SessionSdk {
  preflight(): Promise<string[]>;
  createSession(options: CreateSessionOptions): Promise<PiSessionHandle>;
  continueSession(options: ContinueSessionOptions): Promise<PiSessionHandle>;
  listSessions(options: ListSessionsOptions): Promise<StoredSession[]>;
  abortSession(handle: PiSessionHandle): Promise<void>;
  disposeSession(handle: PiSessionHandle): void;

  getModel(handle: PiSessionHandle): ModelInfo | undefined;
  setModel(handle: PiSessionHandle, provider: string, modelId: string): Promise<ModelInfo>;
  listAvailableModels(provider?: string): Promise<ModelInfo[]>;

  getThinkingLevel(handle: PiSessionHandle): ThinkingLevel;
  setThinkingLevel(handle: PiSessionHandle, level: ThinkingLevel): ThinkingLevel;
  getAvailableThinkingLevels(handle: PiSessionHandle): ThinkingLevel[];

  getSessionStats(handle: PiSessionHandle): SessionStats;

  prompt(handle: PiSessionHandle, text: string): Promise<void>;
  followUp(handle: PiSessionHandle, text: string): Promise<void>;

  getMessages(handle: PiSessionHandle): SessionMessage[];
  isStreaming(handle: PiSessionHandle): boolean;
}

function toModelInfo(model: Model<Api>): ModelInfo {
  return { provider: model.provider, id: model.id, name: model.name };
}

function messageText(message: AgentMessage): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: string; text: string } => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  }
  const summary = (message as { summary?: unknown }).summary;
  if (typeof summary === "string") return summary;
  const command = (message as { command?: unknown }).command;
  const output = (message as { output?: unknown }).output;
  if (typeof command === "string" && typeof output === "string") return `$ ${command}\n${output}`;
  return "";
}

function toSessionMessage(message: AgentMessage): SessionMessage {
  return { role: message.role, text: messageText(message), timestamp: message.timestamp };
}

function toStoredSession(info: SessionInfo): StoredSession {
  return {
    id: info.id,
    cwd: info.cwd,
    name: info.name,
    createdAt: info.created.getTime(),
    modifiedAt: info.modified.getTime(),
    messageCount: info.messageCount,
    firstMessage: info.firstMessage,
  };
}

@singleton()
export class PiSessionClient implements SessionSdk {
  private readonly sessions = new Map<string, AgentSession>();
  private modelRuntimePromise: Promise<ModelRuntime> | undefined;

  constructor(@inject(ConfigService) private readonly config: ConfigService) {}

  private getModelRuntime(): Promise<ModelRuntime> {
    if (!this.modelRuntimePromise) {
      this.modelRuntimePromise = this.createModelRuntime();
    }
    return this.modelRuntimePromise;
  }

  private async createModelRuntime(): Promise<ModelRuntime> {
    const { pi } = this.config.get();
    const runtime = await ModelRuntime.create({
      authPath: pi.authPath,
      modelsPath: pi.modelsPath,
    });
    if (process.env.ANTHROPIC_API_KEY) {
      await runtime.setRuntimeApiKey("anthropic", process.env.ANTHROPIC_API_KEY);
    }
    if (process.env.OPENAI_API_KEY) {
      await runtime.setRuntimeApiKey("openai", process.env.OPENAI_API_KEY);
    }
    return runtime;
  }

  private resolve(handle: PiSessionHandle): AgentSession {
    const session = this.sessions.get(handle.id);
    if (!session) {
      throw new Error(`No active pi session for handle "${handle.id}"`);
    }
    return session;
  }

  async preflight(): Promise<string[]> {
    const { defaultProvider, defaultModel } = this.config.get().pi;
    const modelRuntime = await this.getModelRuntime();
    if (!modelRuntime.getProvider(defaultProvider)) {
      return [`Unknown default provider "${defaultProvider}" (PI_DEFAULT_PROVIDER).`];
    }
    const warnings: string[] = [];
    if (!modelRuntime.getModel(defaultProvider, defaultModel)) {
      warnings.push(`Default model "${defaultModel}" not found for provider "${defaultProvider}" (PI_DEFAULT_MODEL).`);
    }
    if (!modelRuntime.hasConfiguredAuth(defaultProvider)) {
      warnings.push(`No credentials for default provider "${defaultProvider}". Prompts will fail until an API key is set or you log in with the pi CLI.`);
    }
    return warnings;
  }

  private async requireCredentials(provider: string | undefined): Promise<void> {
    if (provider && !(await this.getModelRuntime()).hasConfiguredAuth(provider)) {
      throw new MissingCredentialsError(provider);
    }
  }

  async createSession(options: CreateSessionOptions): Promise<PiSessionHandle> {
    const { pi } = this.config.get();
    const modelRuntime = await this.getModelRuntime();

    const provider = options.provider ?? pi.defaultProvider;
    const modelId = options.model ?? pi.defaultModel;
    const model = modelRuntime.getModel(provider, modelId);
    if (!model) {
      throw new UnknownModelError(provider, modelId);
    }

    const cwd = options.cwd ?? process.cwd();
    const { session } = await createAgentSession({
      cwd,
      agentDir: pi.agentDir,
      modelRuntime,
      model,
      thinkingLevel: options.thinkingLevel ?? pi.defaultThinkingLevel,
      sessionManager: PiSessionManager.create(cwd, pi.sessionDir),
    });
    return this.register(session);
  }

  async continueSession({ sessionId, cwd = process.cwd() }: ContinueSessionOptions): Promise<PiSessionHandle> {
    const { pi } = this.config.get();
    const path = await this.findSessionPath(sessionId, cwd);
    const sessionManager = PiSessionManager.open(path, pi.sessionDir);
    const modelRuntime = await this.getModelRuntime();
    const hasSavedModel = sessionManager.getEntries().some((entry) => entry.type === "model_change");
    const { session } = await createAgentSession({
      cwd: sessionManager.getCwd(),
      agentDir: pi.agentDir,
      modelRuntime,
      model: hasSavedModel ? undefined : modelRuntime.getModel(pi.defaultProvider, pi.defaultModel),
      sessionManager,
    });
    return this.register(session);
  }

  async listSessions({ cwd = process.cwd(), all = false }: ListSessionsOptions): Promise<StoredSession[]> {
    const { pi } = this.config.get();
    const sessions = all ? await PiSessionManager.listAll(pi.sessionDir) : await PiSessionManager.list(cwd, pi.sessionDir);
    return sessions.map(toStoredSession);
  }

  private async findSessionPath(sessionId: string, cwd: string): Promise<string> {
    const { pi } = this.config.get();
    const path =
      PiSessionManager.findById(cwd, sessionId, pi.sessionDir) ??
      (await PiSessionManager.listAll(pi.sessionDir)).find((info) => info.id === sessionId)?.path;
    if (!path) {
      throw new SessionNotFoundError(sessionId);
    }
    return path;
  }

  private register(session: AgentSession): PiSessionHandle {
    this.sessions.set(session.sessionId, session);
    const header = session.sessionManager.getHeader();
    return { id: session.sessionId, createdAt: header ? Date.parse(header.timestamp) : Date.now() };
  }

  async abortSession(handle: PiSessionHandle): Promise<void> {
    await this.resolve(handle).abort();
  }

  disposeSession(handle: PiSessionHandle): void {
    this.resolve(handle).dispose();
    this.sessions.delete(handle.id);
  }

  getModel(handle: PiSessionHandle): ModelInfo | undefined {
    const model = this.resolve(handle).model;
    return model && toModelInfo(model);
  }

  async setModel(handle: PiSessionHandle, provider: string, modelId: string): Promise<ModelInfo> {
    const session = this.resolve(handle);
    const modelRuntime = await this.getModelRuntime();
    const model = modelRuntime.getModel(provider, modelId);
    if (!model) {
      throw new UnknownModelError(provider, modelId);
    }
    await this.requireCredentials(provider);
    await session.setModel(model);
    return toModelInfo(model);
  }

  async listAvailableModels(provider?: string): Promise<ModelInfo[]> {
    const modelRuntime = await this.getModelRuntime();
    const models = await modelRuntime.getAvailable(provider);
    return models.map(toModelInfo);
  }

  getThinkingLevel(handle: PiSessionHandle): ThinkingLevel {
    return this.resolve(handle).thinkingLevel;
  }

  setThinkingLevel(handle: PiSessionHandle, level: ThinkingLevel): ThinkingLevel {
    const session = this.resolve(handle);
    session.setThinkingLevel(level);
    return session.thinkingLevel;
  }

  getAvailableThinkingLevels(handle: PiSessionHandle): ThinkingLevel[] {
    return this.resolve(handle).getAvailableThinkingLevels();
  }

  getSessionStats(handle: PiSessionHandle): SessionStats {
    const stats = this.resolve(handle).getSessionStats();
    return {
      sessionId: handle.id,
      userMessages: stats.userMessages,
      assistantMessages: stats.assistantMessages,
      toolCalls: stats.toolCalls,
      toolResults: stats.toolResults,
      totalMessages: stats.totalMessages,
      tokens: stats.tokens,
      cost: stats.cost,
    };
  }

  async prompt(handle: PiSessionHandle, text: string): Promise<void> {
    const session = this.resolve(handle);
    await this.requireCredentials(session.model?.provider);
    await session.prompt(text);
  }

  async followUp(handle: PiSessionHandle, text: string): Promise<void> {
    const session = this.resolve(handle);
    await this.requireCredentials(session.model?.provider);
    await session.followUp(text);
  }

  getMessages(handle: PiSessionHandle): SessionMessage[] {
    return this.resolve(handle).messages.map(toSessionMessage);
  }

  isStreaming(handle: PiSessionHandle): boolean {
    return this.resolve(handle).isStreaming;
  }
}
