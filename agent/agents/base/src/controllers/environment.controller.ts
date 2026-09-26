import { inject, singleton } from "tsyringe";
import type { CloneRepositoriesInput, CreateAgentMdInput, InjectSkillInput } from "../dto/environment.dto.ts";
import type { CloneRepositoryOptions, CloneResult, EnvironmentFile } from "../models/index.ts";
import { EnvironmentService } from "../services/environment/environment.service.ts";
import {
  optionalPositiveInteger,
  optionalString,
  requireMatch,
  requireNonEmptyArray,
  requireObject,
  requireString,
} from "../utils/validation.ts";

// Agent Skills names: lowercase letters, digits, and single hyphens, at most 64 characters.
const SKILL_NAME = /^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$/;

function cloneOptions(value: unknown, field: string): CloneRepositoryOptions {
  const input = requireObject(value, field);
  return {
    url: requireString(input.url, `${field}.url`),
    directory: optionalString(input.directory, `${field}.directory`),
    depth: optionalPositiveInteger(input.depth, `${field}.depth`),
  };
}

@singleton()
export class EnvironmentController {
  constructor(@inject(EnvironmentService) private readonly environment: EnvironmentService) {}

  ensureWorkspace(): Promise<string> {
    return this.environment.ensureWorkspace();
  }

  async cloneRepositories(input: CloneRepositoriesInput): Promise<CloneResult[]> {
    const repositories = requireNonEmptyArray(input.repositories, "repositories");
    return this.environment.cloneRepositories(
      repositories.map((repository, index) => cloneOptions(repository, `repositories[${index}]`)),
    );
  }

  async createAgentMd(input: CreateAgentMdInput): Promise<EnvironmentFile> {
    return this.environment.createAgentMd({
      content: requireString(input.content, "content"),
    });
  }

  async injectSkill(input: InjectSkillInput): Promise<EnvironmentFile> {
    return this.environment.injectSkill({
      name: requireMatch(input.name, "name", SKILL_NAME, "lowercase letters, digits, and single hyphens (at most 64)"),
      content: requireString(input.content, "content"),
    });
  }
}
