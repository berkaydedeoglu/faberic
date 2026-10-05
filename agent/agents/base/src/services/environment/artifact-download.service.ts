import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../config/config.service.ts";
import type { EnvironmentFile, Logger } from "../../models/index.ts";
import { type Git, GitClient, isHttpUrl } from "../../utils/clients/git/client.ts";
import { type GitTokenSource, OrchestratorClient } from "../../utils/clients/orchestrator/client.ts";
import {
  ArtifactNotFoundError,
  ArtifactsRepositoryNotConfiguredError,
} from "../../utils/errors/environment.errors.ts";
import { ensureDir } from "../../utils/fs.ts";
import { resolveInside } from "../../utils/paths.ts";
import { LoggerService } from "../log/logger.service.ts";

/**
 * Downloads single files from the artifacts repository (ARTIFACTS_REPOSITORY_URL), a private git
 * repository. Only the public loaders in `EnvironmentService` should call it; they pick where the
 * file lands, this service fetches the latest version of whatever path they ask for.
 *
 * The download is a depth-1 sparse clone into a temporary directory — with blob filtering, when the
 * server supports it, only the requested file's content crosses the network — and the file is then
 * copied into the workspace. For HTTP(S) repositories the orchestrator's OAuth-device-flow token is
 * sent as basic auth through `GIT_CONFIG_*`, exactly like `git clone`, so it never touches disk.
 */
@singleton()
export class ArtifactDownloadService {
  constructor(
    @inject(GitClient) private readonly git: Git,
    @inject(OrchestratorClient) private readonly tokens: GitTokenSource,
    @inject(ConfigService) private readonly config: ConfigService,
    @inject(LoggerService) private readonly logger: Logger,
  ) {}

  /** The latest version of `repositoryPath` in the artifacts repository, written to `destination`. */
  async download(repositoryPath: string, destination: string): Promise<EnvironmentFile> {
    const url = this.config.get().environment.artifactsRepository;
    if (url === undefined) {
      throw new ArtifactsRepositoryNotConfiguredError();
    }
    const target = resolveInside(this.config.get().workspace.dir, destination, "destination");
    const temp = await mkdtemp(join(tmpdir(), "faberic-artifacts-"));
    try {
      const token = isHttpUrl(url) ? await this.tokens.getGitToken(url) : undefined;
      await this.git.sparseClone(url, temp, [repositoryPath], { token });
      const source = resolveInside(temp, repositoryPath, "path");
      const info = await stat(source).catch(() => undefined);
      if (info === undefined) {
        throw new ArtifactNotFoundError(url, repositoryPath);
      }
      if (!info.isFile()) {
        throw new ArtifactNotFoundError(url, repositoryPath, true);
      }
      await ensureDir(dirname(target));
      await copyFile(source, target);
      this.logger.debug(`downloaded ${repositoryPath} from ${url} to ${target}`);
      return { path: target };
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
}
