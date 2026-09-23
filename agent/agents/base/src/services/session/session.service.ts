import { inject, singleton } from "tsyringe";
import type {
  ListSessionsOptions,
  ModelInfo,
  SessionMessage,
  SessionStats,
  StoredSession,
  ThinkingLevel,
} from "../../models/index.ts";
import { type PiSessionHandle, PiSessionClient, type SessionSdk } from "../../utils/clients/pi/client.ts";
import { SessionManagerService } from "./session-manager.service.ts";

@singleton()
export class SessionService {
  constructor(
    @inject(PiSessionClient) private readonly sdk: SessionSdk,
    @inject(SessionManagerService) private readonly sessionManager: SessionManagerService,
  ) {}

  private get session(): PiSessionHandle {
    return this.sessionManager.getActiveSession();
  }

  async prompt(text: string): Promise<void> {
    await this.sdk.prompt(this.session, text);
  }

  async followUp(text: string): Promise<void> {
    await this.sdk.followUp(this.session, text);
  }

  getModel(): ModelInfo | undefined {
    return this.sdk.getModel(this.session);
  }

  async setModel(provider: string, modelId: string): Promise<ModelInfo> {
    return this.sdk.setModel(this.session, provider, modelId);
  }

  preflight(): Promise<string[]> {
    return this.sdk.preflight();
  }

  listAvailableModels(provider?: string): Promise<ModelInfo[]> {
    return this.sdk.listAvailableModels(provider);
  }

  listSessions(options: ListSessionsOptions): Promise<StoredSession[]> {
    return this.sdk.listSessions(options);
  }

  getThinkingLevel(): ThinkingLevel {
    return this.sdk.getThinkingLevel(this.session);
  }

  setThinkingLevel(level: ThinkingLevel): ThinkingLevel {
    return this.sdk.setThinkingLevel(this.session, level);
  }

  getAvailableThinkingLevels(): ThinkingLevel[] {
    return this.sdk.getAvailableThinkingLevels(this.session);
  }

  getStats(): SessionStats {
    return this.sdk.getSessionStats(this.session);
  }

  getMessages(): SessionMessage[] {
    return this.sdk.getMessages(this.session);
  }

  isStreaming(): boolean {
    return this.sdk.isStreaming(this.session);
  }
}
