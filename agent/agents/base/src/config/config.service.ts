import { singleton } from "tsyringe";
import { THINKING_LEVELS } from "../models/index.ts";
import { type Env, readEnum, readInt, readOptionalString, readString } from "../utils/env.ts";
import type { AppConfig } from "./config.model.ts";

@singleton()
export class ConfigService {
  private readonly config: AppConfig;

  constructor() {
    this.config = ConfigService.load(process.env);
  }

  get(): AppConfig {
    return this.config;
  }

  static load(env: Env): AppConfig {
    const piHome = `${env.HOME ?? "/tmp"}/.pi/agent`;
    return {
      server: {
        port: readInt(env, "PORT", 6565),
        host: readString(env, "HOST", "0.0.0.0"),
      },
      pi: {
        agentDir: readString(env, "PI_AGENT_DIR", piHome),
        authPath: readString(env, "PI_AUTH_PATH", `${piHome}/auth.json`),
        modelsPath: readString(env, "PI_MODELS_PATH", `${piHome}/models.json`),
        sessionDir: readOptionalString(env, "PI_SESSION_DIR"),
        defaultProvider: readString(env, "PI_DEFAULT_PROVIDER", "anthropic"),
        defaultModel: readString(env, "PI_DEFAULT_MODEL", "claude-sonnet-4-5"),
        defaultThinkingLevel: readEnum(env, "PI_DEFAULT_THINKING_LEVEL", THINKING_LEVELS, "medium"),
      },
      orchestrator: {
        apiUrl: readOptionalString(env, "ORCHESTRATOR_API_URL"),
        apiToken: readOptionalString(env, "ORCHESTRATOR_API_TOKEN"),
      },
      events: {
        batchSize: 50,
        flushIntervalMs: 10_000,
      },
    };
  }
}
