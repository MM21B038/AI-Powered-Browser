import { describe, expect, it } from "vitest";
import {
  collectSeriesValuesFromRows,
  denseCategoryAxisProps,
  formatCartesianTick,
  numericAxisDomainFromValues,
  yDomainForLineArea,
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

  it("yDomainForLineArea with includeZeroOnY false is always auto domain", () => {
    const rows = [
      { name: "a", s0: 10, s1: 2 },
      { name: "b", s0: 20, s1: 3 },
    ];
    expect(yDomainForLineArea(rows, ["s0", "s1"], false)).toBeUndefined();
  });

  it("yDomainForLineArea with includeZeroOnY true matches non-negative pin behavior", () => {
    const rows = [
      { name: "a", s0: 10, s1: 2 },
      { name: "b", s0: 20, s1: 3 },
    ];
    expect(yDomainForLineArea(rows, ["s0", "s1"], true)).toEqual(yDomainNonNegativeIfAllPositive(rows, ["s0", "s1"]));
  });

  it("numericAxisDomainFromValues pads min and max", () => {
    const d = numericAxisDomainFromValues([0, 10]);
    expect(d).toBeDefined();
    expect(d![0]).toBeLessThan(0);
    expect(d![1]).toBeGreaterThan(10);
  });

  it("numericAxisDomainFromValues widens degenerate range", () => {
    const d = numericAxisDomainFromValues([5, 5, 5]);
    expect(d).toBeDefined();
    expect(d![0]).toBeLessThan(5);
    expect(d![1]).toBeGreaterThan(5);
  });

  it("numericAxisDomainFromValues returns undefined for empty input", () => {
    expect(numericAxisDomainFromValues([])).toBeUndefined();
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
