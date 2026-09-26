import { isAbsolute, relative, resolve } from "node:path";
import { ValidationError } from "./errors/app.errors.ts";

/** Resolves `path` against `root` and rejects anything that ends up outside of it. */
export function resolveInside(root: string, path: string, field: string): string {
  const resolved = resolve(root, path);
  const fromRoot = relative(root, resolved);
  if (fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)) {
    throw new ValidationError(`"${field}" must stay inside the workspace`);
  }
  return resolved;
}
