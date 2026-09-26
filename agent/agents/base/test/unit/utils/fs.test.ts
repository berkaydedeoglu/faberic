import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDir, pathExists, writeTextFile } from "../../../src/utils/fs.ts";

describe("fs utils", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-base-fs-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("pathExists tells whether a file or folder is there", async () => {
    expect(await pathExists(dir)).toBe(true);
    expect(await pathExists(join(dir, "missing"))).toBe(false);
  });

  it("ensureDir creates nested folders and accepts existing ones", async () => {
    await ensureDir(join(dir, "a", "b"));
    await ensureDir(join(dir, "a", "b"));
    expect(await pathExists(join(dir, "a", "b"))).toBe(true);
  });

  it("writeTextFile creates parent folders and replaces the file", async () => {
    const path = join(dir, "x", "y", "file.md");
    await writeTextFile(path, "one");
    await writeTextFile(path, "two");
    expect(await readFile(path, "utf8")).toBe("two");
  });
});
