import { UnavailableError } from "./app.errors.ts";

export class OrchestratorNotConfiguredError extends UnavailableError {
  constructor() {
    super("Orchestrator API is not configured. Set ORCHESTRATOR_API_URL and ORCHESTRATOR_API_TOKEN.");
    this.name = "OrchestratorNotConfiguredError";
  }
}

export class OrchestratorRequestError extends UnavailableError {
  constructor(
    public readonly path: string,
    public readonly status: number,
  ) {
    super(`Orchestrator API answered POST /${path} with HTTP ${status}.`);
    this.name = "OrchestratorRequestError";
  }
}

export class GitTokenMissingError extends UnavailableError {
  constructor(public readonly url: string) {
    super(`Orchestrator API returned no git token for "${url}".`);
    this.name = "GitTokenMissingError";
  }
}
