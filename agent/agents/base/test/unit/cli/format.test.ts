import { describe, expect, it } from "bun:test";
import { formatMessages, formatModels, formatSessions, lastAssistantText, toJson } from "../../../src/cli/format.ts";
import type { SessionStats, StoredSession } from "../../../src/models/index.ts";

const stats = {} as SessionStats;

describe("cli format", () => {
  it("toJson pretty-prints", () => {
    expect(toJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("formatMessages prefixes each message with its role", () => {
    expect(
      formatMessages([
        { role: "user", text: "hi", timestamp: 0 },
        { role: "assistant", text: "hello", timestamp: 0 },
      ]),
    ).toBe("[user] hi\n[assistant] hello");
  });

  it("lastAssistantText picks the latest assistant message", () => {
    const messages = [
      { role: "assistant", text: "first", timestamp: 0 },
      { role: "user", text: "again", timestamp: 0 },
      { role: "assistant", text: "second", timestamp: 0 },
      { role: "toolResult", text: "tool", timestamp: 0 },
    ];
    expect(lastAssistantText({ messages, stats })).toBe("second");
  });

  it("lastAssistantText is empty when the assistant has not replied", () => {
    expect(lastAssistantText({ messages: [{ role: "user", text: "hi", timestamp: 0 }], stats })).toBe("");
  });

  it("formatModels prints provider/id and name", () => {
    expect(formatModels([{ provider: "openai", id: "gpt-5", name: "GPT-5" }])).toBe("openai/gpt-5  GPT-5");
  });

  describe("formatSessions", () => {
    const session: StoredSession = {
      id: "abc",
      cwd: "/repo",
      name: undefined,
      createdAt: 0,
      modifiedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
      messageCount: 3,
      firstMessage: "list\n  the   files",
    };

    it("prints one line per session with a collapsed preview", () => {
      expect(formatSessions([session])).toBe("abc  2026-01-02T03:04:05.000Z  3 msgs  /repo  list the files");
    });

    it("truncates long first messages", () => {
      const line = formatSessions([{ ...session, firstMessage: "x".repeat(200) }]);
      expect(line.endsWith(" " + "x".repeat(60))).toBe(true);
    });

    it("says so when there are no sessions", () => {
      expect(formatSessions([])).toBe("No sessions found.");
    });
  });
});
