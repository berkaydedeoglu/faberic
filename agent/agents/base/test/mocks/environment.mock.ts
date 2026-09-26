import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigService } from "../../src/config/config.service.ts";
import { EnvironmentController } from "../../src/controllers/environment.controller.ts";
import { EnvironmentService } from "../../src/services/environment/environment.service.ts";
import type { CloneOptions, Git } from "../../src/utils/clients/git/client.ts";
import type { GitTokenSource } from "../../src/utils/clients/orchestrator/client.ts";
import { GitCommandError } from "../../src/utils/errors/environment.errors.ts";
import { GitTokenMissingError } from "../../src/utils/errors/orchestrator.errors.ts";
import { createTestLogger } from "./logger.mock.ts";
import { RecordingObserver } from "./session-sdk.mock.ts";

/** Behaves like `git clone` without the network: creates the destination with a README naming the URL. */
export class MockGit implements Git {
  readonly clones: { url: string; destination: string; options: CloneOptions }[] = [];
  /** URLs whose clone fails, as git would for a missing or inaccessible repository. */
  readonly failing = new Set<string>();
  delayMs = 0;
  maxConcurrent = 0;
  private inFlight = 0;

  async clone(url: string, destination: string, options: CloneOptions = {}): Promise<void> {
    this.inFlight++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    try {
      if (this.delayMs > 0) await Bun.sleep(this.delayMs);
      if (this.failing.has(url)) {
        throw new GitCommandError("clone", 128, `fatal: repository '${url}' not found`);
      }
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, "README.md"), url);
      this.clones.push({ url, destination, options });
    } finally {
      this.inFlight--;
    }
  }
}

/** Hands out `token-for-<url>`, like the orchestrator after the OAuth device flow. */
export class MockGitTokenSource implements GitTokenSource {
  readonly requested: string[] = [];
  /** URLs the orchestrator has no token for. */
  readonly missing = new Set<string>();

  async getGitToken(url: string): Promise<string> {
    this.requested.push(url);
    if (this.missing.has(url)) throw new GitTokenMissingError(url);
    return `token-for-${url}`;
  }
}

export function workspaceConfig(dir: string, cloneConcurrency = 3): ConfigService {
  const config = ConfigService.load({});
  return { get: () => ({ ...config, workspace: { dir }, environment: { cloneConcurrency } }) } as ConfigService;
}

/** The workspace is a fresh path under the temp dir; it is only created once something is written to it. */
export function createMockedEnvironmentStack(
  workspace = join(tmpdir(), `agent-base-workspace-${randomUUID()}`),
  { cloneConcurrency = 3 }: { cloneConcurrency?: number } = {},
) {
  const git = new MockGit();
  const tokens = new MockGitTokenSource();
  const observer = new RecordingObserver();
  const { file: log, logger } = createTestLogger();
  const service = new EnvironmentService(git, tokens, observer, workspaceConfig(workspace, cloneConcurrency), logger);
  const controller = new EnvironmentController(service);
  const cleanup = () => rm(workspace, { recursive: true, force: true });
  return { workspace, git, tokens, observer, logger, log, service, controller, cleanup };
}
