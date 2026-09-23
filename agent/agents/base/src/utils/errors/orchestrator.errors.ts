import { UnavailableError } from "./app.errors.ts";

export class OrchestratorNotConfiguredError extends UnavailableError {
  constructor() {
    super("Orchestrator API is not configured. Set ORCHESTRATOR_API_URL and ORCHESTRATOR_API_TOKEN.");
    this.name = "OrchestratorNotConfiguredError";
  }
}

export class OrchestratorRequestError extends UnavailableError {
  constructor(public readonly status: number) {
    super(`Orchestrator API rejected the events with HTTP ${status}.`);
    this.name = "OrchestratorRequestError";
  }
}
