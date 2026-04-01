import { describe, expect, it } from "vitest";
import { runScientificCalculator } from "./scientific-calculator";

describe("runScientificCalculator", () => {
  it("evaluates arithmetic with precedence", () => {
    const out = runScientificCalculator({ expression: "2 + 3 * 4" });
    expect(out.success).toBe(true);
    expect(out.result).toBe("14");
  });

  it("rejects empty expression", () => {
    const out = runScientificCalculator({ expression: "   " });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/required/i);
  });

  it("supports power", () => {
    const out = runScientificCalculator({ expression: "2^10" });
    expect(out.success).toBe(true);
    expect(out.result).toBe("1024");
  });

  it("supports sqrt", () => {
    const out = runScientificCalculator({ expression: "sqrt(144)" });
    expect(out.success).toBe(true);
    expect(out.result).toBe("12");
  });

  it("supports nthRoot alias nroot", () => {
    const out = runScientificCalculator({ expression: "nthRoot(27, 3)" });
    expect(out.success).toBe(true);
    expect(out.result).toBe("3");
    const out2 = runScientificCalculator({ expression: "nroot(32, 5)" });
    expect(out2.success).toBe(true);
    expect(Number(out2.result)).toBeCloseTo(2, 10);
  });

  it("returns error on invalid syntax", () => {
    const out = runScientificCalculator({ expression: "2 +" });
    expect(out.success).toBe(false);
    expect(out.error).toBeTruthy();
  });

  it("supports sin and pi", () => {
    const out = runScientificCalculator({ expression: "sin(pi / 2)" });
    expect(out.success).toBe(true);
    expect(Number(out.result)).toBeCloseTo(1, 12);
  });

  it("supports ln and e", () => {
    expect(runScientificCalculator({ expression: "ln(e)" }).result).toBe("1");
    const log10 = runScientificCalculator({ expression: "log10(100)" });
    expect(log10.success).toBe(true);
    expect(log10.result).toBe("2");
  });

  it("supports inverse trig", () => {
    const out = runScientificCalculator({ expression: "asin(1)" });
    expect(out.success).toBe(true);
    expect(Number(out.result)).toBeCloseTo(Math.PI / 2, 10);
  });
});
