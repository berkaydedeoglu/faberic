import { inject, singleton } from "tsyringe";
import { EnvironmentController } from "../../controllers/environment.controller.ts";

interface WithBody {
  body: unknown;
}

interface WithStatus {
  set: { status?: number | string };
}

function bodyOf({ body }: WithBody): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

@singleton()
export class EnvironmentHttpHandler {
  constructor(@inject(EnvironmentController) private readonly controller: EnvironmentController) {}

  // 201 when every repository was cloned, 207 when some failed; each result says which.
  async clone(request: WithBody & WithStatus) {
    const repositories = await this.controller.cloneRepositories(bodyOf(request));
    request.set.status = repositories.every((repository) => repository.status === "cloned") ? 201 : 207;
    return { repositories };
  }

  async createAgentMd(request: WithBody & WithStatus) {
    const result = await this.controller.createAgentMd(bodyOf(request));
    request.set.status = 201;
    return result;
  }

  async injectSkill(request: WithBody & WithStatus) {
    const result = await this.controller.injectSkill(bodyOf(request));
    request.set.status = 201;
    return result;
  }
}
