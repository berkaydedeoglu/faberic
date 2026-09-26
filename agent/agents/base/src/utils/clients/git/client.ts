import { singleton } from "tsyringe";
import { GitCommandError } from "../../errors/environment.errors.ts";

export interface CloneOptions {
  /** Shallow clone with this many commits; full history when unset. */
  readonly depth?: number;
  /** Sent as HTTP basic auth to the repository's host only; ignored for non-HTTP(S) URLs. */
  readonly token?: string;
}

export interface Git {
  clone(url: string, destination: string, options?: CloneOptions): Promise<void>;
}

/** The folder name `git clone` picks for a URL: its last path segment without `.git`. */
export function repositoryName(url: string): string {
  const segment = url.replace(/[/\\]+$/, "").split(/[/\\:]/).at(-1) ?? "";
  return segment.replace(/\.git$/, "");
}

/** Tokens only work over HTTP(S); SSH and local URLs are cloned as they are. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Passed through GIT_CONFIG_* so the token is neither in the process arguments nor in .git/config,
// and scoped to the repository's origin so a redirect to another host never receives it.
function authConfig(url: string, token: string): Record<string, string> {
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `http.${new URL(url).origin}/.extraHeader`,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${btoa(`x-access-token:${token}`)}`,
  };
}

@singleton()
export class GitClient implements Git {
  async clone(url: string, destination: string, { depth, token }: CloneOptions = {}): Promise<void> {
    const shallow = depth === undefined ? [] : ["--depth", String(depth)];
    const auth = token !== undefined && isHttpUrl(url) ? authConfig(url, token) : {};
    await this.run(["clone", ...shallow, "--", url, destination], auth);
  }

  private async run(args: string[], env: Record<string, string>): Promise<void> {
    const proc = Bun.spawn(["git", ...args], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
      // Fail instead of waiting on a credential prompt nobody can answer.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    });
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    if (exitCode !== 0) {
      throw new GitCommandError(args[0]!, exitCode, stderr.trim());
    }
  }
}
