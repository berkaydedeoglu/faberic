import { ConfigService } from "../../src/config/config.service.ts";
import type { LogLevel } from "../../src/models/index.ts";
import type { LogFile, LogWriter } from "../../src/services/log/log-writers.ts";
import { LoggerService } from "../../src/services/log/logger.service.ts";

export class RecordingLogWriter implements LogWriter {
  readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }
}

/** Keeps the "file" in memory; readTail returns the end of the content like the real file would. */
export class MemoryLogFile extends RecordingLogWriter implements LogFile {
  closed = false;

  async flush(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async readTail(bytes: number): Promise<string> {
    const content = this.lines.map((line) => `${line}\n`).join("");
    return content.slice(-bytes);
  }
}

type Logging = Partial<{ consoleLevel: LogLevel; fileLevel: LogLevel; file: string }>;

export function loggingConfig(logging: Logging = {}): ConfigService {
  const config = ConfigService.load({});
  return { get: () => ({ ...config, logging: { ...config.logging, file: "/tmp/agent-test.log", ...logging } }) } as ConfigService;
}

/** A logger that writes to memory instead of the console and the log file. */
export function createTestLogger(logging: Logging = {}) {
  const writer = new RecordingLogWriter();
  const file = new MemoryLogFile();
  const logger = new LoggerService(writer, file, loggingConfig(logging));
  return { writer, file, logger };
}
