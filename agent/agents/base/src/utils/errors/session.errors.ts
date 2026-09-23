import { ConflictError, NotFoundError, UnavailableError } from "./app.errors.ts";

export class NoActiveSessionError extends NotFoundError {
  constructor() {
    super("No active session. Create one first.");
    this.name = "NoActiveSessionError";
  }
}

export class SessionAlreadyActiveError extends ConflictError {
  constructor(public readonly sessionId: string) {
    super(`A session (${sessionId}) is already active. Destroy it first, or use force.`);
    this.name = "SessionAlreadyActiveError";
  }
}

export class ModelNotSelectedError extends NotFoundError {
  constructor() {
    super("Active session has no model selected.");
    this.name = "ModelNotSelectedError";
  }
}

export class UnknownModelError extends NotFoundError {
  constructor(provider: string, modelId: string) {
    super(`Unknown model "${modelId}" for provider "${provider}"`);
    this.name = "UnknownModelError";
  }
}

export class SessionNotFoundError extends NotFoundError {
  constructor(sessionId: string) {
    super(`No stored session with id "${sessionId}"`);
    this.name = "SessionNotFoundError";
  }
}

export class MissingCredentialsError extends UnavailableError {
  constructor(public readonly provider: string) {
    super(`No credentials configured for provider "${provider}". Set its API key in .env or log in with the pi CLI.`);
    this.name = "MissingCredentialsError";
  }
}
