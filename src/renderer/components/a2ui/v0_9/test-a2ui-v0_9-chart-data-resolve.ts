import { describe, expect, it, vi } from "vitest";
import {
  isDynamicLeaf,
  resolveCategoriesWithDataContext,
  resolveSeriesWithDataContext,
} from "./a2ui-v0_9-chart-data-resolve";

describe("a2ui v0.9 chart data resolve", () => {
  it("isDynamicLeaf detects path and functionCall shapes", () => {
    expect(isDynamicLeaf({ path: "/a" })).toBe(true);
    expect(isDynamicLeaf({ call: "x", args: {} })).toBe(true);
    expect(isDynamicLeaf([1, 2])).toBe(false);
    expect(isDynamicLeaf(null)).toBe(false);
  });

  it("resolveSeriesWithDataContext without dc matches literal arrays", () => {
    const s = resolveSeriesWithDataContext(
      [
        { name: "A", values: [1, 2, 3] },
        { name: "B", values: [4, 5, 6] },
      ],
      null
    );
    expect(s).toEqual([
      { name: "A", values: [1, 2, 3] },
      { name: "B", values: [4, 5, 6] },
    ]);
  });

  it("resolveSeriesWithDataContext resolves nested functionCall via dc", () => {
    const fc = { call: "series_expr", args: { expression: "x", xMin: 0, xMax: 2, steps: 3 }, returnType: "array" };
    const dc = {
      resolveDynamicValue: vi.fn((v: unknown) => {
        if (v === fc) return [0, 1, 2];
        return undefined;
      }),
      subscribeDynamicValue: vi.fn(() => ({ unsubscribe: vi.fn() })),
    };
    const s = resolveSeriesWithDataContext([{ name: "S", values: fc }], dc);
    expect(dc.resolveDynamicValue).toHaveBeenCalledWith(fc);
    expect(s).toEqual([{ name: "S", values: [0, 1, 2] }]);
  });

  it("resolveCategoriesWithDataContext resolves functionCall via dc", () => {
    const fc = { call: "series_expr", args: { expression: "x", xMin: 0, xMax: 1, steps: 2 }, returnType: "array" };
    const dc = {
      resolveDynamicValue: vi.fn((v: unknown) => (v === fc ? [0, 1] : undefined)),
      subscribeDynamicValue: vi.fn(() => ({ unsubscribe: vi.fn() })),
    };
    const c = resolveCategoriesWithDataContext(fc, dc);
    expect(c).toEqual(["0", "1"]);
  });
});
