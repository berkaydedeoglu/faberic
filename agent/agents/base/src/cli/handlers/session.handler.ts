import { inject, singleton } from "tsyringe";
import { SessionController } from "../../controllers/session.controller.ts";
import type { ContinueSessionInput, CreateSessionInput, ListModelsInput } from "../../dto/session.dto.ts";
import { formatMessages, formatModels, formatSessions, lastAssistantText, toJson } from "../format.ts";

@singleton()
export class SessionCliHandler {
  constructor(@inject(SessionController) private readonly controller: SessionController) {}

  async attach(): Promise<string> {
    if (this.controller.hasSessions()) {
      return `Using session ${this.controller.getSession().id}.`;
    }
    const [recent] = (await this.controller.listSessions()).sort((a, b) => b.modifiedAt - a.modifiedAt);
    if (recent) {
      await this.controller.continueSession({ sessionId: recent.id });
      return `Resumed session ${recent.id} (${recent.messageCount} messages). Use "session create" to open another one.`;
    }
    const created = await this.controller.createSession({});
    return `Created session ${created.id}.`;
  }

  // Without an explicit target, a process with no open session attaches one first.
  private async ensureSession(sessionId: string | undefined): Promise<void> {
    if (sessionId === undefined && !this.controller.hasSessions()) {
      await this.attach();
    }
  }

  async create(input: CreateSessionInput): Promise<string> {
    return toJson(await this.controller.createSession(input));
  }

  async continue(input: ContinueSessionInput): Promise<string> {
    return toJson(await this.controller.continueSession(input));
  }

  async list(): Promise<string> {
    return formatSessions(await this.controller.listSessions());
  }

  listOpen(): string {
    return toJson(this.controller.listOpenSessions());
  }

  setDefault(sessionId: string): string {
    return toJson(this.controller.setDefaultSession({ sessionId }));
  }

  async get(sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return toJson(this.controller.getSession({ sessionId }));
  }

  async abort(sessionId?: string): Promise<string> {
    return toJson(await this.controller.abortSession({ sessionId }));
  }

  async destroy(sessionId?: string): Promise<string> {
    return toJson(await this.controller.destroySession({ sessionId }));
  }

  async getModel(sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return toJson(this.controller.getModel({ sessionId }));
  }

  async setModel(provider: string, model: string, sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return toJson(await this.controller.setModel({ provider, model, sessionId }));
  }

  async listModels(input: ListModelsInput): Promise<string> {
    return formatModels(await this.controller.listAvailableModels(input));
  }

  async getThinkingLevel(sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return toJson(this.controller.getThinkingLevel({ sessionId }));
  }

  async setThinkingLevel(level: string, sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return toJson(this.controller.setThinkingLevel({ thinkingLevel: level, sessionId }));
  }

  async getStats(sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return toJson(this.controller.getStats({ sessionId }));
  }

  async getMessages(sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return formatMessages(this.controller.getMessages({ sessionId }));
  }

  async prompt(words: string[], sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return lastAssistantText(await this.controller.prompt({ text: words.join(" "), sessionId }));
  }

  async followUp(words: string[], sessionId?: string): Promise<string> {
    await this.ensureSession(sessionId);
    return lastAssistantText(await this.controller.followUp({ text: words.join(" "), sessionId }));
  }
}
