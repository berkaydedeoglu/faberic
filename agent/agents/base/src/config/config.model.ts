import type { ThinkingLevel } from "../models/index.ts";

export interface AppConfig {
  readonly server: {
    readonly port: number;
    readonly host: string;
  };
  readonly pi: {
    readonly agentDir: string;
    readonly authPath: string;
    readonly modelsPath: string;
    readonly sessionDir: string | undefined;
    readonly defaultProvider: string;
    readonly defaultModel: string;
    readonly defaultThinkingLevel: ThinkingLevel;
  };
}
