import { inject, singleton } from "tsyringe";
import { SessionController } from "../../controllers/session.controller.ts";
import type { ContinueSessionInput, CreateSessionInput, ListModelsInput, ListSessionsInput } from "../../dto/session.dto.ts";
import { formatMessages, formatModels, formatSessions, lastAssistantText, toJson } from "../format.ts";

@singleton()
export class SessionCliHandler {
  constructor(@inject(SessionController) private readonly controller: SessionController) {}

  async attach(): Promise<string> {
    if (this.controller.hasActiveSession()) {
      return `Using session ${this.controller.getSession().id}.`;
    }
    const [recent] = (await this.controller.listSessions({})).sort((a, b) => b.modifiedAt - a.modifiedAt);
    if (recent) {
      await this.controller.continueSession({ sessionId: recent.id });
      return `Resumed session ${recent.id} (${recent.messageCount} messages). Use "session create --force" to start a new one.`;
    }
    const created = await this.controller.createSession({});
    return `Created session ${created.id}.`;
  }

  private async ensureSession(): Promise<void> {
    if (!this.controller.hasActiveSession()) {
      await this.attach();
    }
  }

  async create(input: CreateSessionInput): Promise<string> {
    return toJson(await this.controller.createSession(input));
  }

  async continue(input: ContinueSessionInput): Promise<string> {
    return toJson(await this.controller.continueSession(input));
  }

  async list(input: ListSessionsInput): Promise<string> {
    return formatSessions(await this.controller.listSessions(input));
  }

  async get(): Promise<string> {
    await this.ensureSession();
    return toJson(this.controller.getSession());
  }

  async abort(): Promise<string> {
    return toJson(await this.controller.abortSession());
  }

  async destroy(): Promise<string> {
    return toJson(await this.controller.destroySession());
  }

  async getModel(): Promise<string> {
    await this.ensureSession();
    return toJson(this.controller.getModel());
  }

  async setModel(provider: string, model: string): Promise<string> {
    await this.ensureSession();
    return toJson(await this.controller.setModel({ provider, model }));
  }

  async listModels(input: ListModelsInput): Promise<string> {
    return formatModels(await this.controller.listAvailableModels(input));
  }

  async getThinkingLevel(): Promise<string> {
    await this.ensureSession();
    return toJson(this.controller.getThinkingLevel());
  }

  async setThinkingLevel(level: string): Promise<string> {
    await this.ensureSession();
    return toJson(this.controller.setThinkingLevel({ thinkingLevel: level }));
  }

  async getStats(): Promise<string> {
    await this.ensureSession();
    return toJson(this.controller.getStats());
  }

  async getMessages(): Promise<string> {
    await this.ensureSession();
    return formatMessages(this.controller.getMessages());
  }

  async prompt(words: string[]): Promise<string> {
    await this.ensureSession();
    return lastAssistantText(await this.controller.prompt({ text: words.join(" ") }));
  }

  async followUp(words: string[]): Promise<string> {
    await this.ensureSession();
    return lastAssistantText(await this.controller.followUp({ text: words.join(" ") }));
  }
}
