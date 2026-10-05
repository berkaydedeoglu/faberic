import { ConflictError, NotFoundError, UnavailableError } from "./app.errors.ts";

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

export class ArtifactsRepositoryNotConfiguredError extends UnavailableError {
  constructor() {
    super("Artifacts repository is not configured. Set ARTIFACTS_REPOSITORY_URL.");
    this.name = "ArtifactsRepositoryNotConfiguredError";
  }
}

export class ArtifactNotFoundError extends NotFoundError {
  constructor(
    public readonly url: string,
    public readonly repositoryPath: string,
    public readonly isDirectory = false,
  ) {
    super(
      isDirectory
        ? `"${repositoryPath}" in the latest commit of ${url} is a directory, not a file.`
        : `No file "${repositoryPath}" in the latest commit of ${url}.`,
    );
    this.name = "ArtifactNotFoundError";
  }
}
