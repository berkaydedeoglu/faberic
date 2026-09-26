import { readFile } from "node:fs/promises";
import { inject, singleton } from "tsyringe";
import { EnvironmentController } from "../../controllers/environment.controller.ts";
import type { CloneRepositoryInput } from "../../dto/environment.dto.ts";
import { ValidationError } from "../../utils/errors/app.errors.ts";
import { toJson } from "../format.ts";

export interface ContentOptions {
  file?: string;
}

// File content comes from the positional words or from --file, never both.
async function contentOf(words: string[], file: string | undefined): Promise<string> {
  if (file === undefined) return words.join(" ");
  if (words.length > 0) {
    throw new ValidationError("Pass the content as arguments or with --file, not both");
  }
  return readFile(file, "utf8");
}

@singleton()
export class EnvironmentCliHandler {
  constructor(@inject(EnvironmentController) private readonly controller: EnvironmentController) {}

  // The CLI clones one repository per command; the service takes a list, so send a list of one.
  async clone(input: CloneRepositoryInput): Promise<string> {
    const [result] = await this.controller.cloneRepositories({ repositories: [input] });
    if (result!.status === "failed") {
      throw new Error(result!.error);
    }
    return toJson(result);
  }

  async createAgentMd(words: string[], { file }: ContentOptions): Promise<string> {
    return toJson(await this.controller.createAgentMd({ content: await contentOf(words, file) }));
  }

  async injectSkill(name: string, words: string[], { file }: ContentOptions): Promise<string> {
    return toJson(await this.controller.injectSkill({ name, content: await contentOf(words, file) }));
  }
}
