import { ValidationError } from "./errors/app.errors.ts";

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`"${field}" must be a non-empty string`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requireString(value, field);
}

export function requireOneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`"${field}" must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function optionalOneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  return value === undefined ? undefined : requireOneOf(value, field, allowed);
}
