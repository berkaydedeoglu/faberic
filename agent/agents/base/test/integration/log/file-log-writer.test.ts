import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConsoleLogWriter, FileLogWriter } from "../../../src/services/log/log-writers.ts";
import { loggingConfig } from "../../mocks/logger.mock.ts";

describe("FileLogWriter (real file system)", () => {
  let dir: string;
  let path: string;
  let writer: FileLogWriter;

  beforeEach(() => {
    dir = join(tmpdir(), `agent-base-logs-${randomUUID()}`);
    path = join(dir, "nested", "agent.log");
    writer = new FileLogWriter(loggingConfig({ file: path }));
  });

  afterEach(async () => {
    await writer.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("creates the directory and file on the first write and appends one line per write", async () => {
    writer.write("one");
    writer.write("two");
    await writer.flush();
    expect(await readFile(path, "utf8")).toBe("one\ntwo\n");
  });

  it("appends to an existing file", async () => {
    await mkdir(join(dir, "nested"), { recursive: true });
    await writeFile(path, "old\n");
    writer.write("new");
    await writer.close();
    expect(await readFile(path, "utf8")).toBe("old\nnew\n");
  });

  it("keeps many writes in order without waiting on each", async () => {
    for (let i = 0; i < 1000; i++) writer.write(`line ${i}`);
    await writer.flush();
    const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
    expect(lines).toEqual(Array.from({ length: 1000 }, (_, i) => `line ${i}`));
  });

  it("reads the tail, including lines not flushed yet", async () => {
    writer.write("first");
    writer.write("second");
    expect(await writer.readTail(7)).toBe("second\n");
    expect(await writer.readTail(1_000)).toBe("first\nsecond\n");
  });

  it("reads an empty tail when nothing was written", async () => {
    expect(await writer.readTail(100)).toBe("");
  });

  it("does nothing on flush or close before the first write", async () => {
    await writer.flush();
    await writer.close();
    expect(await writer.readTail(100)).toBe("");
  });

  it("reopens the file after close", async () => {
    writer.write("a");
    await writer.close();
    writer.write("b");
    await writer.flush();
    expect(await readFile(path, "utf8")).toBe("a\nb\n");
  });

  it("warns once and stops writing when the file cannot be written", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "nested"), "a file where the directory should be");
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    try {
      writer.write("lost");
      await Bun.sleep(20);
      writer.write("also lost");
      await writer.flush();
      await writer.close();
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError.mock.calls[0]![0]).toStartWith(`warning: cannot write log file ${path}: `);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("rethrows read errors other than a missing file", async () => {
    await mkdir(path, { recursive: true });
    await expect(writer.readTail(10)).rejects.toThrow();
  });
});

describe("ConsoleLogWriter", () => {
  it("writes to stderr", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    try {
      new ConsoleLogWriter().write("line");
      expect(consoleError).toHaveBeenCalledWith("line");
    } finally {
      consoleError.mockRestore();
    }
  });
});
