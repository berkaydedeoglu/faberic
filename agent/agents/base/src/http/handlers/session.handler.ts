import { inject, singleton } from "tsyringe";
import { SessionController } from "../../controllers/session.controller.ts";

interface WithBody {
  body: unknown;
}

interface WithQuery {
  query: Record<string, string | undefined>;
}

interface WithStatus {
  set: { status?: number | string };
}

function bodyOf({ body }: WithBody): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

@singleton()
export class SessionHttpHandler {
  constructor(@inject(SessionController) private readonly controller: SessionController) {}

  async create(request: WithBody & WithStatus) {
    const session = await this.controller.createSession(bodyOf(request));
    request.set.status = 201;
    return session;
  }

  continue(request: WithBody) {
    return this.controller.continueSession(bodyOf(request));
  }

  list({ query }: WithQuery) {
    return this.controller.listSessions({ cwd: query.cwd, all: query.all === "true" });
  }

  get() {
    return this.controller.getSession();
  }

  abort() {
    return this.controller.abortSession();
  }

  destroy() {
    return this.controller.destroySession();
  }

  getModel() {
    return this.controller.getModel();
  }

  setModel(request: WithBody) {
    return this.controller.setModel(bodyOf(request));
  }

  listModels({ query }: WithQuery) {
    return this.controller.listAvailableModels({ provider: query.provider });
  }

  getThinkingLevel() {
    return this.controller.getThinkingLevel();
  }

  setThinkingLevel(request: WithBody) {
    return this.controller.setThinkingLevel(bodyOf(request));
  }

  getStats() {
    return this.controller.getStats();
  }

  getMessages() {
    return this.controller.getMessages();
  }

  prompt(request: WithBody) {
    return this.controller.prompt(bodyOf(request));
  }

  followUp(request: WithBody) {
    return this.controller.followUp(bodyOf(request));
  }
}
