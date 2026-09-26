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

// The target session always comes from `?sessionId=`; without it the default session is used.
function targetOf({ query }: WithQuery): { sessionId: string | undefined } {
  return { sessionId: query.sessionId };
}

function targetedBodyOf(request: WithBody & WithQuery): Record<string, unknown> {
  return { ...bodyOf(request), ...targetOf(request) };
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

  list() {
    return this.controller.listSessions();
  }

  listOpen() {
    return this.controller.listOpenSessions();
  }

  setDefault(request: WithBody) {
    return this.controller.setDefaultSession(bodyOf(request));
  }

  get(request: WithQuery) {
    return this.controller.getSession(targetOf(request));
  }

  abort(request: WithQuery) {
    return this.controller.abortSession(targetOf(request));
  }

  destroy(request: WithQuery) {
    return this.controller.destroySession(targetOf(request));
  }

  getModel(request: WithQuery) {
    return this.controller.getModel(targetOf(request));
  }

  setModel(request: WithBody & WithQuery) {
    return this.controller.setModel(targetedBodyOf(request));
  }

  listModels({ query }: WithQuery) {
    return this.controller.listAvailableModels({ provider: query.provider });
  }

  getThinkingLevel(request: WithQuery) {
    return this.controller.getThinkingLevel(targetOf(request));
  }

  setThinkingLevel(request: WithBody & WithQuery) {
    return this.controller.setThinkingLevel(targetedBodyOf(request));
  }

  getStats(request: WithQuery) {
    return this.controller.getStats(targetOf(request));
  }

  getMessages(request: WithQuery) {
    return this.controller.getMessages(targetOf(request));
  }

  prompt(request: WithBody & WithQuery) {
    return this.controller.prompt(targetedBodyOf(request));
  }

  followUp(request: WithBody & WithQuery) {
    return this.controller.followUp(targetedBodyOf(request));
  }
}
