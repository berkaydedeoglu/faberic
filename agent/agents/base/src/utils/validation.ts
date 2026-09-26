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

export function requireMatch(value: unknown, field: string, pattern: RegExp, rule: string): string {
  const text = requireString(value, field);
  if (!pattern.test(text)) {
    throw new ValidationError(`"${field}" must be ${rule}`);
  }
  return text;
}

export function requireNonEmptyArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`"${field}" must be a non-empty array`);
  }
  return value;
}

export function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(`"${field}" must be an object`);
  }
  return value as Record<string, unknown>;
}

export function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ValidationError(`"${field}" must be a positive integer`);
  }
  return value;
}
