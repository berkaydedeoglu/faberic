export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface SessionMessage {
  readonly role: string;
  readonly text: string;
  readonly timestamp: number;
}

export interface ModelInfo {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
}

export interface SessionUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly total: number;
}

export interface SessionStats {
  readonly sessionId: string;
  readonly userMessages: number;
  readonly assistantMessages: number;
  readonly toolCalls: number;
  readonly toolResults: number;
  readonly totalMessages: number;
  readonly tokens: SessionUsage;
  readonly cost: number;
}

export type SessionStatus = "idle" | "streaming" | "aborted" | "disposed";

export interface SessionDescriptor {
  readonly id: string;
  readonly isDefault: boolean;
  readonly status: SessionStatus;
  readonly model: ModelInfo | undefined;
  readonly thinkingLevel: ThinkingLevel;
  readonly createdAt: number;
}

export interface CreateSessionOptions {
  readonly provider?: string;
  readonly model?: string;
  readonly thinkingLevel?: ThinkingLevel;
}

export interface StoredSession {
  readonly id: string;
  readonly name: string | undefined;
  readonly createdAt: number;
  readonly modifiedAt: number;
  readonly messageCount: number;
  readonly firstMessage: string;
}

export interface ContinueSessionOptions {
  readonly sessionId: string;
}
