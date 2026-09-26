import { describe, expect, it } from "bun:test";
import { formatLogEntry, isErrorLine } from "../../../src/services/log/logger.service.ts";
import { createTestLogger } from "../../mocks/logger.mock.ts";

const levelAndMessage = (line: string) => line.split(" ").slice(1).join(" ");

describe("LoggerService", () => {
  it("writes info and up to the console and only errors to the file by default", () => {
    const { writer, file, logger } = createTestLogger();
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(writer.lines.map(levelAndMessage)).toEqual(["info: i", "warn: w", "error: e"]);
    expect(file.lines.map(levelAndMessage)).toEqual(["error: e"]);
  });

  it("applies the console and file levels independently", () => {
    const { writer, file, logger } = createTestLogger({ consoleLevel: "error", fileLevel: "debug" });
    logger.debug("d");
    logger.warn("w");
    logger.error("e");
    expect(writer.lines.map(levelAndMessage)).toEqual(["error: e"]);
    expect(file.lines.map(levelAndMessage)).toEqual(["debug: d", "warn: w", "error: e"]);
  });

  it("writes the same `<ISO time> <level>: <message>` line to both", () => {
    const { writer, file, logger } = createTestLogger();
    logger.error("boom");
    expect(writer.lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z error: boom$/);
    expect(file.lines).toEqual(writer.lines);
  });

  it("appends the error's message", () => {
    const { writer, logger } = createTestLogger();
    logger.error("clone failed", new Error("not found"));
    logger.warn("odd", "plain string");
    expect(writer.lines.map(levelAndMessage)).toEqual(["error: clone failed: not found", "warn: odd: plain string"]);
  });

  it("closes the log file", async () => {
    const { file, logger } = createTestLogger();
    await logger.close();
    expect(file.closed).toBe(true);
  });
});

describe("formatLogEntry", () => {
  it("formats an entry as one line, escaping newlines in the message", () => {
    const time = new Date("2026-01-02T03:04:05.000Z");
    expect(formatLogEntry({ level: "error", time, message: "boom" })).toBe("2026-01-02T03:04:05.000Z error: boom");
    expect(formatLogEntry({ level: "error", time, message: "fatal:\nnot found\r\n" })).toBe(
      "2026-01-02T03:04:05.000Z error: fatal:\\nnot found\\n",
    );
  });
});

describe("isErrorLine", () => {
  it("matches error lines only", () => {
    expect(isErrorLine("2026-01-02T03:04:05.000Z error: boom")).toBe(true);
    expect(isErrorLine("2026-01-02T03:04:05.000Z warn: error: boom")).toBe(false);
    expect(isErrorLine("05.000Z error: partial")).toBe(true);
    expect(isErrorLine("rror: partial")).toBe(false);
    expect(isErrorLine("")).toBe(false);
  });
});
