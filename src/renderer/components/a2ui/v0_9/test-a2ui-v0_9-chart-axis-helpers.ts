import { describe, expect, it } from "vitest";
import {
  collectSeriesValuesFromRows,
  denseCategoryAxisProps,
  formatCartesianTick,
  yDomainNonNegativeIfAllPositive,
} from "./a2ui-v0_9-chart-axis-helpers";

describe("a2ui v0.9 chart axis helpers", () => {
  it("yDomainNonNegativeIfAllPositive pins at zero when all series values are >= 0", () => {
    const rows = [
      { name: "a", s0: 10, s1: 2 },
      { name: "b", s0: 20, s1: 3 },
    ];
    expect(yDomainNonNegativeIfAllPositive(rows, ["s0", "s1"])).toEqual([0, "auto"]);
  });

  it("yDomainNonNegativeIfAllPositive leaves domain auto when any value is negative", () => {
    const rows = [
      { name: "a", s0: 10, s1: -1 },
      { name: "b", s0: 20, s1: 3 },
    ];
    expect(yDomainNonNegativeIfAllPositive(rows, ["s0", "s1"])).toBeUndefined();
  });

  it("collectSeriesValuesFromRows gathers all numeric series columns", () => {
    expect(collectSeriesValuesFromRows([{ name: "x", s0: 1, s1: 2 }], ["s0", "s1"])).toEqual([1, 2]);
  });

  it("denseCategoryAxisProps tilts when many rows", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ name: String(i), s0: i }));
    expect(denseCategoryAxisProps(rows).angle).toBe(-35);
  });

  it("formatCartesianTick shortens large magnitudes vs raw digits", () => {
    const s = formatCartesianTick(1_250_000);
    expect(s).not.toBe("1250000");
    expect(s.length).toBeLessThan(String(1_250_000).length);
  });
});
