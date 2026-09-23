import type { SessionMessage, SessionStats, ThinkingLevel } from "../models/index.ts";

export interface CreateSessionInput {
  provider?: unknown;
  model?: unknown;
  thinkingLevel?: unknown;
  cwd?: unknown;
  force?: unknown;
}

export interface ContinueSessionInput {
  sessionId?: unknown;
  cwd?: unknown;
  force?: unknown;
}

export interface ListSessionsInput {
  cwd?: unknown;
  all?: unknown;
}

export interface SetModelInput {
  provider?: unknown;
  model?: unknown;
}

export interface ListModelsInput {
  provider?: unknown;
}

export interface SetThinkingLevelInput {
  thinkingLevel?: unknown;
}

export interface PromptInput {
  text?: unknown;
}

export interface ThinkingLevelState {
  thinkingLevel: ThinkingLevel;
  available: ThinkingLevel[];
}

export interface PromptResult {
  messages: SessionMessage[];
  stats: SessionStats;
}
