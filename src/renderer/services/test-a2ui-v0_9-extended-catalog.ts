import { describe, expect, it } from "vitest";
import { buildA2uiV09ExtendedCatalog } from "./a2ui-v0_9-extended-catalog";

describe("a2ui v0.9 extended catalog", () => {
  it("provides expected extra functions", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    expect(cat.functions.get("toString")).toBeTruthy();
    expect(cat.functions.get("concat")).toBeTruthy();
    expect(cat.functions.get("array_length")).toBeTruthy();
    expect(cat.functions.get("count_where")).toBeTruthy();
    expect(cat.functions.get("sparkline_svg")).toBeTruthy();
    expect(cat.functions.get("sum_by_key")).toBeTruthy();
    expect(cat.functions.get("group_count")).toBeTruthy();
    expect(cat.functions.get("format_currency")).toBeTruthy();
    expect(cat.functions.get("format_percent")).toBeTruthy();
    expect(cat.functions.get("moving_average")).toBeTruthy();
  });

  it("sum_by_key sums numeric fields", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    const fn = cat.functions.get("sum_by_key");
    const r = fn.execute({ array: [{ a: 1 }, { a: "2" }, { a: 3 }], key: "a" }, null);
    expect(r).toBe(6);
  });

  it("moving_average returns smoothed series", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    const fn = cat.functions.get("moving_average");
    const r = fn.execute({ series: [1, 2, 3, 4], window: 2 }, null);
    expect(r).toEqual([1, 1.5, 2.5, 3.5]);
  });
});

