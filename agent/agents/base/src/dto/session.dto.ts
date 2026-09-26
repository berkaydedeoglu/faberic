import type { SessionMessage, SessionStats, ThinkingLevel } from "../models/index.ts";

export interface CreateSessionInput {
  provider?: unknown;
  model?: unknown;
  thinkingLevel?: unknown;
}

export interface ContinueSessionInput {
  sessionId?: unknown;
}

/** Picks the open session to act on; the default session when `sessionId` is missing. */
export interface SessionTargetInput {
  sessionId?: unknown;
}

export interface SetDefaultSessionInput {
  sessionId?: unknown;
}

export interface SetModelInput extends SessionTargetInput {
  provider?: unknown;
  model?: unknown;
}

export interface ListModelsInput {
  provider?: unknown;
}

export interface SetThinkingLevelInput extends SessionTargetInput {
  thinkingLevel?: unknown;
}

export interface PromptInput extends SessionTargetInput {
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
