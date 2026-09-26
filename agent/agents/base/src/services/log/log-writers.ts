import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { dirname } from "node:path";
import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../config/config.service.ts";

export interface LogWriter {
  write(line: string): void;
}

export interface LogFile extends LogWriter {
  /** Resolves once every line written so far is on disk. */
  flush(): Promise<void>;
  close(): Promise<void>;
  /** The last `bytes` of the file after a flush; empty when nothing was written yet. */
  readTail(bytes: number): Promise<string>;
}

@singleton()
export class ConsoleLogWriter implements LogWriter {
  write(line: string): void {
    console.error(line);
  }
}

/**
 * Appends lines to `LOG_FILE` through a write stream: `write` only queues the line, the file system
 * work happens off the caller's path. The file and its directory are created on the first write.
 */
@singleton()
export class FileLogWriter implements LogFile {
  private stream: WriteStream | undefined;
  private failed = false;

  constructor(@inject(ConfigService) private readonly config: ConfigService) {}

  get path(): string {
    return this.config.get().logging.file;
  }

  write(line: string): void {
    if (this.failed) return;
    this.open().write(`${line}\n`);
  }

  flush(): Promise<void> {
    const stream = this.stream;
    if (!stream || this.failed) return Promise.resolve();
    // Writes complete in order, so this callback runs after every earlier line is written.
    return new Promise((resolve) => stream.write("", () => resolve()));
  }

  async close(): Promise<void> {
    const stream = this.stream;
    this.stream = undefined;
    if (!stream || this.failed) return;
    await new Promise<void>((resolve) => stream.end(() => resolve()));
  }

  async readTail(bytes: number): Promise<string> {
    await this.flush();
    let file;
    try {
      file = await open(this.path, "r");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
    try {
      const { size } = await file.stat();
      const length = Math.min(bytes, size);
      const buffer = Buffer.alloc(length);
      await file.read(buffer, 0, length, size - length);
      return buffer.toString("utf8");
    } finally {
      await file.close();
    }
  }

  private open(): WriteStream {
    if (!this.stream) {
      const path = this.path;
      try {
        mkdirSync(dirname(path), { recursive: true });
      } catch (error) {
        this.fail(error);
      }
      this.stream = createWriteStream(path, { flags: "a" });
      // A broken log file must not take the process down; warn once and stop writing to it.
      this.stream.on("error", (error) => this.fail(error));
    }
    return this.stream;
  }

  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    console.error(`warning: cannot write log file ${this.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
