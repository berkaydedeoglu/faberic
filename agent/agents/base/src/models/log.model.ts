export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  readonly level: LogLevel;
  readonly time: Date;
  readonly message: string;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  /** `error`, when given, is appended to the message as `: <error message>`. */
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}
