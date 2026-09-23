import { inject, singleton } from "tsyringe";
import type {
  ContinueSessionInput,
  CreateSessionInput,
  ListModelsInput,
  ListSessionsInput,
  PromptInput,
  PromptResult,
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
import type { PiSessionHandle } from "../utils/clients/pi/client.ts";
import { ModelNotSelectedError } from "../utils/errors/session.errors.ts";
import { optionalOneOf, optionalString, requireOneOf, requireString } from "../utils/validation.ts";

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
      cwd: optionalString(input.cwd, "cwd"),
    };
    const session = await this.sessionManager.createSession(options, input.force === true);
    return this.describe(session);
  }

  async continueSession(input: ContinueSessionInput): Promise<SessionDescriptor> {
    const session = await this.sessionManager.continueSession(
      { sessionId: requireString(input.sessionId, "sessionId"), cwd: optionalString(input.cwd, "cwd") },
      input.force === true,
    );
    return this.describe(session);
  }

  async listSessions(input: ListSessionsInput): Promise<StoredSession[]> {
    return this.sessionService.listSessions({ cwd: optionalString(input.cwd, "cwd"), all: input.all === true });
  }

  hasActiveSession(): boolean {
    return this.sessionManager.hasActiveSession();
  }

  getSession(): SessionDescriptor {
    return this.describe(this.sessionManager.getActiveSession());
  }

  async abortSession(): Promise<SessionDescriptor> {
    const session = this.sessionManager.getActiveSession();
    await this.sessionManager.abortActiveSession();
    return this.describe(session);
  }

  async destroySession(): Promise<{ status: "disposed" }> {
    this.sessionManager.getActiveSession();
    await this.sessionManager.destroyActiveSession();
    return { status: "disposed" };
  }

  getModel(): ModelInfo {
    const model = this.sessionService.getModel();
    if (!model) {
      throw new ModelNotSelectedError();
    }
    return model;
  }

  async setModel(input: SetModelInput): Promise<ModelInfo> {
    const provider = requireString(input.provider, "provider");
    const model = requireString(input.model, "model");
    return this.sessionService.setModel(provider, model);
  }

  async listAvailableModels(input: ListModelsInput): Promise<ModelInfo[]> {
    return this.sessionService.listAvailableModels(optionalString(input.provider, "provider"));
  }

  getThinkingLevel(): ThinkingLevelState {
    return {
      thinkingLevel: this.sessionService.getThinkingLevel(),
      available: this.sessionService.getAvailableThinkingLevels(),
    };
  }

  setThinkingLevel(input: SetThinkingLevelInput): ThinkingLevelState {
    const level = requireOneOf(input.thinkingLevel, "thinkingLevel", THINKING_LEVELS);
    return {
      thinkingLevel: this.sessionService.setThinkingLevel(level),
      available: this.sessionService.getAvailableThinkingLevels(),
    };
  }

  getStats(): SessionStats {
    return this.sessionService.getStats();
  }

  getMessages(): SessionMessage[] {
    return this.sessionService.getMessages();
  }

  async prompt(input: PromptInput): Promise<PromptResult> {
    await this.sessionService.prompt(requireString(input.text, "text"));
    return this.promptResult();
  }

  async followUp(input: PromptInput): Promise<PromptResult> {
    await this.sessionService.followUp(requireString(input.text, "text"));
    return this.promptResult();
  }

  private promptResult(): PromptResult {
    return {
      messages: this.sessionService.getMessages(),
      stats: this.sessionService.getStats(),
    };
  }

  private describe(session: PiSessionHandle): SessionDescriptor {
    return {
      id: session.id,
      status: this.sessionService.isStreaming() ? "streaming" : "idle",
      model: this.sessionService.getModel(),
      thinkingLevel: this.sessionService.getThinkingLevel(),
      createdAt: session.createdAt,
    };
  }
}
