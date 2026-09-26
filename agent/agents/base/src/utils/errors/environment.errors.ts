import { ConflictError } from "./app.errors.ts";

export class RepositoryExistsError extends ConflictError {
  constructor(public readonly path: string) {
    super(`"${path}" already exists. Clone into another directory.`);
    this.name = "RepositoryExistsError";
  }
}

export class GitCommandError extends Error {
  constructor(
    public readonly command: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(`git ${command} failed with exit code ${exitCode}${stderr ? `: ${stderr}` : ""}`);
    this.name = "GitCommandError";
  }
}
