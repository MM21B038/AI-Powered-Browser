import { describe, expect, it } from "vitest";
import {
  differentiateNumeric,
  integrateNumeric,
  partialDifferentiateNumeric,
} from "./a2ui-v0_9-math-catalog-helpers";

describe("A2UI numeric calculus helpers", () => {
  it("differentiates x^2 at x=3 (~6)", () => {
    const d = differentiateNumeric({ expression: "x^2", x: 3, h: 1e-5 });
    expect(d).toBeGreaterThan(5.99);
    expect(d).toBeLessThan(6.01);
  });

  it("integrates x from 0..1 (~0.5)", () => {
    const area = integrateNumeric({ expression: "x", xMin: 0, xMax: 1, steps: 400 });
    expect(area).toBeGreaterThan(0.49);
    expect(area).toBeLessThan(0.51);
  });

  it("partialDifferentiateNumeric: ∂(x^2 + y)/∂x at (3,5) (~6)", () => {
    const d = partialDifferentiateNumeric({
      expression: "x^2 + y",
      wrt: "x",
      h: 1e-5,
      scope: { x: 3, y: 5 },
    });
    expect(d).toBeGreaterThan(5.99);
    expect(d).toBeLessThan(6.01);
  });

  it("partialDifferentiateNumeric: ∂(x*y)/∂y at (2,3) (~2)", () => {
    const d = partialDifferentiateNumeric({
      expression: "x*y",
      wrt: "y",
      h: 1e-5,
      scope: { x: 2, y: 3 },
    });
    expect(d).toBeGreaterThan(1.99);
    expect(d).toBeLessThan(2.01);
  });
});

