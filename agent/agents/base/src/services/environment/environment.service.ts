import { join } from "node:path";
import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../config/config.service.ts";
import type {
  CloneRepositoryOptions,
  CloneResult,
  CreateAgentMdOptions,
  EnvironmentFile,
  EventObserver,
  InjectSkillOptions,
  Logger,
} from "../../models/index.ts";
import { type Git, GitClient, isHttpUrl, repositoryName } from "../../utils/clients/git/client.ts";
import { type GitTokenSource, OrchestratorClient } from "../../utils/clients/orchestrator/client.ts";
import { mapWithConcurrency } from "../../utils/concurrency.ts";
import { ValidationError } from "../../utils/errors/app.errors.ts";
import { RepositoryExistsError } from "../../utils/errors/environment.errors.ts";
import { ensureDir, pathExists, writeTextFile } from "../../utils/fs.ts";
import { resolveInside } from "../../utils/paths.ts";
import { EventManager } from "../event/event-manager.service.ts";
import { LoggerService } from "../log/logger.service.ts";

/**
 * Prepares the workspace, the single working directory every session of this agent runs in.
 * Each operation reports `<type>_start`, then `<type>_end` or `<type>_error`.
 */
@singleton()
export class EnvironmentService {
  constructor(
    @inject(GitClient) private readonly git: Git,
    @inject(OrchestratorClient) private readonly tokens: GitTokenSource,
    @inject(EventManager) private readonly observer: EventObserver,
    @inject(ConfigService) private readonly config: ConfigService,
    @inject(LoggerService) private readonly logger: Logger,
  ) {}

  get workspace(): string {
    return this.config.get().workspace.dir;
  }

  async ensureWorkspace(): Promise<string> {
    await ensureDir(this.workspace);
    return this.workspace;
  }

  /** Clones up to `cloneConcurrency` repositories at a time; each one reports its own events. */
  async cloneRepositories(repositories: CloneRepositoryOptions[]): Promise<CloneResult[]> {
    const paths = repositories.map(({ url, directory }) => resolveInside(this.workspace, directory ?? repositoryName(url), "directory"));
    const duplicate = paths.find((path, index) => paths.indexOf(path) !== index);
    if (duplicate !== undefined) {
      throw new ValidationError(`More than one repository would be cloned into "${duplicate}"`);
    }
    const { cloneConcurrency } = this.config.get().environment;
    return mapWithConcurrency(repositories, cloneConcurrency, (repository, index) => this.clone(repository, paths[index]!));
  }

  private async clone({ url, depth }: CloneRepositoryOptions, path: string): Promise<CloneResult> {
    try {
      await this.track("repository_clone", `clone ${url} into ${path}`, async () => {
        if (await pathExists(path)) {
          throw new RepositoryExistsError(path);
        }
        const token = isHttpUrl(url) ? await this.tokens.getGitToken(url) : undefined;
        await this.git.clone(url, path, { depth, token });
      });
      return { url, path, status: "cloned" };
    } catch (error) {
      return { url, path, status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }

  // pi reads AGENTS.md and project skills from the session's cwd, so both live at the workspace root.
  async createAgentMd({ content }: CreateAgentMdOptions): Promise<EnvironmentFile> {
    const path = join(this.workspace, "AGENTS.md");
    return this.track("agent_md_create", `write ${path}`, async () => {
      await writeTextFile(path, content);
      return { path };
    });
  }

  async injectSkill({ name, content }: InjectSkillOptions): Promise<EnvironmentFile> {
    const path = join(this.workspace, ".pi", "skills", name, "SKILL.md");
    return this.track("skill_inject", `inject skill ${name} into ${path}`, async () => {
      await writeTextFile(path, content);
      return { path };
    });
  }

  private async track<T>(type: string, action: string, run: () => Promise<T>): Promise<T> {
    this.emit(`${type}_start`, `${action} started`);
    try {
      const result = await run();
      this.emit(`${type}_end`, `${action} finished`);
      return result;
    } catch (error) {
      this.logger.error(`${action} failed`, error);
      this.emit(`${type}_error`, `${action} failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private emit(type: string, description: string): void {
    this.observer.update({ type, time: new Date(), description });
  }
}
