import type { LogLevel, ThinkingLevel } from "../models/index.ts";

export interface AppConfig {
  readonly server: {
    readonly port: number;
    readonly host: string;
  };
  readonly workspace: {
    readonly dir: string;
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
  readonly orchestrator: {
    readonly apiUrl: string | undefined;
    readonly apiToken: string | undefined;
  };
  readonly events: {
    readonly batchSize: number;
    readonly flushIntervalMs: number;
  };
  readonly environment: {
    readonly cloneConcurrency: number;
  };
  readonly logging: {
    readonly consoleLevel: LogLevel;
    readonly fileLevel: LogLevel;
    readonly file: string;
  };
  readonly monitoring: {
    readonly errorLogChars: number;
    readonly errorLogScanBytes: number;
  };
}
