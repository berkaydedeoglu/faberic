import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../config/config.service.ts";
import { LOG_LEVELS, type LogEntry, type LogLevel, type Logger } from "../../models/index.ts";
import { ConsoleLogWriter, FileLogWriter, type LogFile, type LogWriter } from "./log-writers.ts";

/** One line per entry: newlines inside the message are escaped so the file stays line based. */
export function formatLogEntry({ level, time, message }: LogEntry): string {
  return `${time.toISOString()} ${level}: ${message.replace(/\r?\n/g, "\\n")}`;
}

const ERROR_LINE = /^\S+Z error: /;

export function isErrorLine(line: string): boolean {
  return ERROR_LINE.test(line);
}

const atLeast = (level: LogLevel, threshold: LogLevel) => LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(threshold);

/** Writes entries at or above `LOG_CONSOLE_LEVEL` to the console and at or above `LOG_FILE_LEVEL` to `LOG_FILE`. */
@singleton()
export class LoggerService implements Logger {
  constructor(
    @inject(ConsoleLogWriter) private readonly console: LogWriter,
    @inject(FileLogWriter) private readonly file: LogFile,
    @inject(ConfigService) private readonly config: ConfigService,
  ) {}

  debug(message: string): void {
    this.log("debug", message);
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string, error?: unknown): void {
    this.log("warn", message, error);
  }

  error(message: string, error?: unknown): void {
    this.log("error", message, error);
  }

  /** Waits for queued lines to reach the log file and closes it. */
  close(): Promise<void> {
    return this.file.close();
  }

  private log(level: LogLevel, message: string, error?: unknown): void {
    const { consoleLevel, fileLevel } = this.config.get().logging;
    const toConsole = atLeast(level, consoleLevel);
    const toFile = atLeast(level, fileLevel);
    if (!toConsole && !toFile) return;
    const line = formatLogEntry({
      level,
      time: new Date(),
      message: error === undefined ? message : `${message}: ${error instanceof Error ? error.message : String(error)}`,
    });
    if (toConsole) this.console.write(line);
    if (toFile) this.file.write(line);
  }
}
