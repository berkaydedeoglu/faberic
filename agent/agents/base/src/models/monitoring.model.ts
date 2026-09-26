import type { SessionDescriptor, SessionStats } from "./session.model.ts";

export interface SessionInfo extends SessionDescriptor {
  readonly stats: SessionStats;
}

export interface ErrorLogTail {
  /** The log file the errors were read from. */
  readonly file: string;
  /** The last characters of the error lines in the log file, `<time> error: <message>`, oldest first. */
  readonly log: string;
}
