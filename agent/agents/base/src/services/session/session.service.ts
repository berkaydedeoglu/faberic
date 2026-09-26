import { inject, singleton } from "tsyringe";
import type {
  ModelInfo,
  SessionDescriptor,
  SessionMessage,
  SessionStats,
  StoredSession,
  ThinkingLevel,
} from "../../models/index.ts";
import { type PiSessionHandle, PiSessionClient, type SessionSdk } from "../../utils/clients/pi/client.ts";
import { SessionManagerService } from "./session-manager.service.ts";

/** Operations on an open session. Every `sessionId` is optional; without it the default session is used. */
@singleton()
export class SessionService {
  constructor(
    @inject(PiSessionClient) private readonly sdk: SessionSdk,
    @inject(SessionManagerService) private readonly sessionManager: SessionManagerService,
  ) {}

  private session(sessionId?: string): PiSessionHandle {
    return this.sessionManager.getSession(sessionId);
  }

  async prompt(text: string, sessionId?: string): Promise<void> {
    await this.sdk.prompt(this.session(sessionId), text);
  }

  async followUp(text: string, sessionId?: string): Promise<void> {
    await this.sdk.followUp(this.session(sessionId), text);
  }

  getModel(sessionId?: string): ModelInfo | undefined {
    return this.sdk.getModel(this.session(sessionId));
  }

  async setModel(provider: string, modelId: string, sessionId?: string): Promise<ModelInfo> {
    return this.sdk.setModel(this.session(sessionId), provider, modelId);
  }

  preflight(): Promise<string[]> {
    return this.sdk.preflight();
  }

  listAvailableModels(provider?: string): Promise<ModelInfo[]> {
    return this.sdk.listAvailableModels(provider);
  }

  listSessions(): Promise<StoredSession[]> {
    return this.sdk.listSessions();
  }

  getThinkingLevel(sessionId?: string): ThinkingLevel {
    return this.sdk.getThinkingLevel(this.session(sessionId));
  }

  setThinkingLevel(level: ThinkingLevel, sessionId?: string): ThinkingLevel {
    return this.sdk.setThinkingLevel(this.session(sessionId), level);
  }

  getAvailableThinkingLevels(sessionId?: string): ThinkingLevel[] {
    return this.sdk.getAvailableThinkingLevels(this.session(sessionId));
  }

  getStats(sessionId?: string): SessionStats {
    return this.sdk.getSessionStats(this.session(sessionId));
  }

  getMessages(sessionId?: string): SessionMessage[] {
    return this.sdk.getMessages(this.session(sessionId));
  }

  describe(sessionId?: string): SessionDescriptor {
    const handle = this.session(sessionId);
    return {
      id: handle.id,
      isDefault: handle.id === this.sessionManager.getDefaultSession().id,
      status: this.sdk.isStreaming(handle) ? "streaming" : "idle",
      model: this.sdk.getModel(handle),
      thinkingLevel: this.sdk.getThinkingLevel(handle),
      createdAt: handle.createdAt,
    };
  }
}
