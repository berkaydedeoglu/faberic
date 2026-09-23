import { describe, expect, it } from "bun:test";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import { optionalOneOf, optionalString, requireOneOf, requireString } from "../../../src/utils/validation.ts";

const LEVELS = ["low", "high"] as const;

describe("validation", () => {
  it("requireString accepts non-blank strings only", () => {
    expect(requireString("x", "f")).toBe("x");
    expect(() => requireString("  ", "f")).toThrow(ValidationError);
    expect(() => requireString(undefined, "f")).toThrow('"f" must be a non-empty string');
    expect(() => requireString(42, "f")).toThrow(ValidationError);
  });

  it("optionalString lets undefined through but still rejects bad values", () => {
    expect(optionalString(undefined, "f")).toBeUndefined();
    expect(optionalString("x", "f")).toBe("x");
    expect(() => optionalString("", "f")).toThrow(ValidationError);
    expect(() => optionalString(null, "f")).toThrow(ValidationError);
  });

  it("requireOneOf accepts only listed values and names them", () => {
    expect(requireOneOf("high", "level", LEVELS)).toBe("high");
    expect(() => requireOneOf("ultra", "level", LEVELS)).toThrow('"level" must be one of: low, high');
    expect(() => requireOneOf(undefined, "level", LEVELS)).toThrow(ValidationError);
  });

  it("optionalOneOf lets undefined through", () => {
    expect(optionalOneOf(undefined, "level", LEVELS)).toBeUndefined();
    expect(optionalOneOf("low", "level", LEVELS)).toBe("low");
    expect(() => optionalOneOf("ultra", "level", LEVELS)).toThrow(ValidationError);
  });
});
