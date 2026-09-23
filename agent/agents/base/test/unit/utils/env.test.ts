import { describe, expect, it } from "bun:test";
import { readEnum, readInt, readOptionalString, readString } from "../../../src/utils/env.ts";

describe("env readers", () => {
  it("readString falls back on missing or empty values", () => {
    expect(readString({ A: "x" }, "A", "d")).toBe("x");
    expect(readString({}, "A", "d")).toBe("d");
    expect(readString({ A: "" }, "A", "d")).toBe("d");
  });

  it("readOptionalString treats empty as unset", () => {
    expect(readOptionalString({ A: "x" }, "A")).toBe("x");
    expect(readOptionalString({ A: "" }, "A")).toBeUndefined();
    expect(readOptionalString({}, "A")).toBeUndefined();
  });

  it("readInt parses integers and falls back when unset", () => {
    expect(readInt({ A: "8080" }, "A", 1)).toBe(8080);
    expect(readInt({}, "A", 1)).toBe(1);
    expect(readInt({ A: "" }, "A", 1)).toBe(1);
  });

  it("readInt rejects anything that is not a whole integer", () => {
    expect(() => readInt({ A: "abc" }, "A", 1)).toThrow('Invalid integer for A: "abc"');
    expect(() => readInt({ A: "3000abc" }, "A", 1)).toThrow();
    expect(() => readInt({ A: "1.5" }, "A", 1)).toThrow();
  });

  it("readEnum accepts allowed values and names them when rejecting", () => {
    const levels = ["low", "high"] as const;
    expect(readEnum({ A: "high" }, "A", levels, "low")).toBe("high");
    expect(readEnum({}, "A", levels, "low")).toBe("low");
    expect(() => readEnum({ A: "ultra" }, "A", levels, "low")).toThrow(
      'Invalid value for A: "ultra". Expected one of low, high',
    );
  });
});
