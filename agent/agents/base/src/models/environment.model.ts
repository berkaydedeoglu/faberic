export interface CloneRepositoryOptions {
  readonly url: string;
  /** Folder name inside the workspace; git's default (derived from the URL) when unset. */
  readonly directory?: string;
  /** Shallow clone with this many commits; full history when unset. */
  readonly depth?: number;
}

/** One entry per requested repository, in request order. A failed clone does not stop the others. */
export type CloneResult =
  | { readonly url: string; readonly path: string; readonly status: "cloned" }
  | { readonly url: string; readonly path: string; readonly status: "failed"; readonly error: string };

export interface CreateAgentMdOptions {
  readonly content: string;
}

export interface InjectSkillOptions {
  readonly name: string;
  readonly content: string;
}

export interface EnvironmentFile {
  readonly path: string;
}
