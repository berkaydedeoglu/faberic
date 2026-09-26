import { inject, singleton } from "tsyringe";
import type {
  ContinueSessionInput,
  CreateSessionInput,
  ListModelsInput,
  PromptInput,
  PromptResult,
  SessionTargetInput,
  SetDefaultSessionInput,
  SetModelInput,
  SetThinkingLevelInput,
  ThinkingLevelState,
} from "../dto/session.dto.ts";
import {
  type CreateSessionOptions,
  type ModelInfo,
  type SessionDescriptor,
  type SessionMessage,
  type SessionStats,
  type StoredSession,
  THINKING_LEVELS,
} from "../models/index.ts";
import { SessionManagerService } from "../services/session/session-manager.service.ts";
import { SessionService } from "../services/session/session.service.ts";
import { ModelNotSelectedError } from "../utils/errors/session.errors.ts";
import { optionalOneOf, optionalString, requireOneOf, requireString } from "../utils/validation.ts";

// A missing or blank session id means the default session.
function target({ sessionId }: SessionTargetInput): string | undefined {
  if (sessionId === undefined || (typeof sessionId === "string" && sessionId.trim() === "")) return undefined;
  return requireString(sessionId, "sessionId");
}

@singleton()
export class SessionController {
  constructor(
    @inject(SessionManagerService) private readonly sessionManager: SessionManagerService,
    @inject(SessionService) private readonly sessionService: SessionService,
  ) {}

  preflight(): Promise<string[]> {
    return this.sessionService.preflight();
  }

  async createSession(input: CreateSessionInput): Promise<SessionDescriptor> {
    const options: CreateSessionOptions = {
      provider: optionalString(input.provider, "provider"),
      model: optionalString(input.model, "model"),
      thinkingLevel: optionalOneOf(input.thinkingLevel, "thinkingLevel", THINKING_LEVELS),
    };
    const session = await this.sessionManager.createSession(options);
    return this.sessionService.describe(session.id);
  }

  async continueSession(input: ContinueSessionInput): Promise<SessionDescriptor> {
    const session = await this.sessionManager.continueSession({ sessionId: requireString(input.sessionId, "sessionId") });
    return this.sessionService.describe(session.id);
  }

  async listSessions(): Promise<StoredSession[]> {
    return this.sessionService.listSessions();
  }

  hasSessions(): boolean {
    return this.sessionManager.hasSessions();
  }

  listOpenSessions(): SessionDescriptor[] {
    return this.sessionManager.listSessions().map((session) => this.sessionService.describe(session.id));
  }

  getSession(input: SessionTargetInput = {}): SessionDescriptor {
    return this.sessionService.describe(target(input));
  }

  setDefaultSession(input: SetDefaultSessionInput): SessionDescriptor {
    const session = this.sessionManager.setDefaultSession(requireString(input.sessionId, "sessionId"));
    return this.sessionService.describe(session.id);
  }

  async abortSession(input: SessionTargetInput = {}): Promise<SessionDescriptor> {
    const session = await this.sessionManager.abortSession(target(input));
    return this.sessionService.describe(session.id);
  }

  async destroySession(input: SessionTargetInput = {}): Promise<{ id: string; status: "disposed" }> {
    const session = await this.sessionManager.destroySession(target(input));
    return { id: session.id, status: "disposed" };
  }

  getModel(input: SessionTargetInput = {}): ModelInfo {
    const model = this.sessionService.getModel(target(input));
    if (!model) {
      throw new ModelNotSelectedError();
    }
    return model;
  }

  async setModel(input: SetModelInput): Promise<ModelInfo> {
    const provider = requireString(input.provider, "provider");
    const model = requireString(input.model, "model");
    return this.sessionService.setModel(provider, model, target(input));
  }

  async listAvailableModels(input: ListModelsInput): Promise<ModelInfo[]> {
    return this.sessionService.listAvailableModels(optionalString(input.provider, "provider"));
  }

  getThinkingLevel(input: SessionTargetInput = {}): ThinkingLevelState {
    const sessionId = target(input);
    return {
      thinkingLevel: this.sessionService.getThinkingLevel(sessionId),
      available: this.sessionService.getAvailableThinkingLevels(sessionId),
    };
  }

  setThinkingLevel(input: SetThinkingLevelInput): ThinkingLevelState {
    const level = requireOneOf(input.thinkingLevel, "thinkingLevel", THINKING_LEVELS);
    const sessionId = target(input);
    return {
      thinkingLevel: this.sessionService.setThinkingLevel(level, sessionId),
      available: this.sessionService.getAvailableThinkingLevels(sessionId),
    };
  }

  getStats(input: SessionTargetInput = {}): SessionStats {
    return this.sessionService.getStats(target(input));
  }

  getMessages(input: SessionTargetInput = {}): SessionMessage[] {
    return this.sessionService.getMessages(target(input));
  }

  async prompt(input: PromptInput): Promise<PromptResult> {
    const text = requireString(input.text, "text");
    // Pin the id so the result comes from the same session even if the default changes meanwhile.
    const sessionId = this.sessionManager.getSession(target(input)).id;
    await this.sessionService.prompt(text, sessionId);
    return this.promptResult(sessionId);
  }

  async followUp(input: PromptInput): Promise<PromptResult> {
    const text = requireString(input.text, "text");
    const sessionId = this.sessionManager.getSession(target(input)).id;
    await this.sessionService.followUp(text, sessionId);
    return this.promptResult(sessionId);
  }

  private promptResult(sessionId: string): PromptResult {
    return {
      messages: this.sessionService.getMessages(sessionId),
      stats: this.sessionService.getStats(sessionId),
    };
  }
}
