import type { PromptResult } from "../dto/session.dto.ts";
import type { ModelInfo, SessionMessage, StoredSession } from "../models/index.ts";

const FIRST_MESSAGE_PREVIEW = 60;

export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatMessages(messages: SessionMessage[]): string {
  return messages.map((message) => `[${message.role}] ${message.text}`).join("\n");
}

export function lastAssistantText({ messages }: PromptResult): string {
  return messages.findLast((message) => message.role === "assistant")?.text ?? "";
}

export function formatModels(models: ModelInfo[]): string {
  return models.map((model) => `${model.provider}/${model.id}  ${model.name}`).join("\n");
}

export function formatSessions(sessions: StoredSession[]): string {
  if (sessions.length === 0) return "No sessions found.";
  return sessions
    .map((session) => {
      const preview = session.firstMessage.replace(/\s+/g, " ").slice(0, FIRST_MESSAGE_PREVIEW);
      const modified = new Date(session.modifiedAt).toISOString();
      return `${session.id}  ${modified}  ${session.messageCount} msgs  ${preview}`;
    })
    .join("\n");
}
