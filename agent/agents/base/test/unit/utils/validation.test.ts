import { describe, expect, it } from "bun:test";
import { ValidationError } from "../../../src/utils/errors/app.errors.ts";
import {
  optionalOneOf,
  optionalPositiveInteger,
  optionalString,
  requireMatch,
  requireNonEmptyArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../../../src/utils/validation.ts";

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

  it("requireMatch accepts strings matching the pattern and describes the rule", () => {
    expect(requireMatch("abc", "f", /^[a-z]+$/, "letters")).toBe("abc");
    expect(() => requireMatch("ABC", "f", /^[a-z]+$/, "letters")).toThrow('"f" must be letters');
    expect(() => requireMatch(undefined, "f", /^[a-z]+$/, "letters")).toThrow('"f" must be a non-empty string');
  });

  it("requireNonEmptyArray accepts arrays with at least one item", () => {
    expect(requireNonEmptyArray([1], "f")).toEqual([1]);
    expect(() => requireNonEmptyArray([], "f")).toThrow('"f" must be a non-empty array');
    expect(() => requireNonEmptyArray({ 0: 1 }, "f")).toThrow(ValidationError);
    expect(() => requireNonEmptyArray(undefined, "f")).toThrow(ValidationError);
  });

  it("requireObject accepts plain objects only", () => {
    expect(requireObject({ a: 1 }, "f")).toEqual({ a: 1 });
    for (const value of [null, [], "x", 1, undefined]) {
      expect(() => requireObject(value, "f")).toThrow('"f" must be an object');
    }
  });

  it("optionalPositiveInteger lets undefined through and accepts integers from 1", () => {
    expect(optionalPositiveInteger(undefined, "f")).toBeUndefined();
    expect(optionalPositiveInteger(1, "f")).toBe(1);
    for (const value of [0, -1, 1.5, Number.NaN, "1", null]) {
      expect(() => optionalPositiveInteger(value, "f")).toThrow('"f" must be a positive integer');
    }
  });
});
