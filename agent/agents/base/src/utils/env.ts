export type Env = Record<string, string | undefined>;

export function readString(env: Env, key: string, fallback: string): string {
  return env[key] || fallback;
}

export function readOptionalString(env: Env, key: string): string | undefined {
  return env[key] || undefined;
}

export function readInt(env: Env, key: string, fallback: number): number {
  const value = env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for ${key}: "${value}"`);
  }
  return parsed;
}

export function readEnum<T extends string>(env: Env, key: string, allowed: readonly T[], fallback: T): T {
  const value = env[key];
  if (!value) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Invalid value for ${key}: "${value}". Expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}
