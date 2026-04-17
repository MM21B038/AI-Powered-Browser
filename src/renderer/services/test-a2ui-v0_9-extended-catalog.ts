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
    expect(cat.functions.get("format_compact_currency")).toBeTruthy();
    expect(cat.functions.get("format_percent")).toBeTruthy();
    expect(cat.functions.get("moving_average")).toBeTruthy();
    expect(cat.functions.get("math_eval")).toBeTruthy();
    expect(cat.functions.get("series_expr")).toBeTruthy();
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

  it("math_eval evaluates expression with top-level numeric args", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    const fn = cat.functions.get("math_eval");
    expect(fn.execute({ expression: "a^2", a: 3 }, null)).toBe(9);
    expect(fn.execute({ expression: "a + b", a: 1, b: 2 }, null)).toBe(3);
  });

  it("format_compact_currency shortens large amounts (en-US)", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    const fn = cat.functions.get("format_compact_currency");
    const a = fn.execute({ value: 48420, currency: "USD", locale: "en-US", maxFractionDigits: 2 }, null) as string;
    const b = fn.execute({ value: 1_200_000, currency: "USD", locale: "en-US", maxFractionDigits: 2 }, null) as string;
    expect(a.length).toBeLessThan(16);
    expect(/K/i.test(a)).toBe(true);
    expect(/M/i.test(b)).toBe(true);
    const small = fn.execute({ value: 42.5, currency: "USD", locale: "en-US", maxFractionDigits: 2 }, null) as string;
    expect(small).toMatch(/\$|USD/);
  });

  it("series_expr sweeps x and applies extra variables", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    const fn = cat.functions.get("series_expr");
    const r = fn.execute(
      { expression: "x + a", xMin: 0, xMax: 1, steps: 3, a: 1 },
      null
    ) as number[];
    expect(r).toEqual([1, 1.5, 2]);
  });

  it("series_expr schema accepts DynamicNumber wire shapes for sweep params", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    const fn = cat.functions.get("series_expr");
    const parsed = fn.schema.parse({
      expression: "x",
      xMin: { path: "/domainStart" },
      xMax: { path: "/domainEnd" },
      steps: { path: "/sampleCount" },
      a: { path: "/a" },
    });
    expect(parsed).toMatchObject({
      expression: "x",
      xMin: { path: "/domainStart" },
      xMax: { path: "/domainEnd" },
      steps: { path: "/sampleCount" },
    });
  });

  it("series_expr schema rejects args without sweep (each LineChart series_expr needs xMin, xMax, steps)", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    const fn = cat.functions.get("series_expr");
    expect(() =>
      fn.schema.parse({
        expression: "p + x",
        p: 10000,
        r: 7,
        m: 250,
      })
    ).toThrow();
  });

  it("series_expr with full sweep executes for chart-style growth curves", () => {
    const cat: any = buildA2uiV09ExtendedCatalog();
    const fn = cat.functions.get("series_expr");
    const p = 10000;
    const r = 7;
    const t = 30;
    const m = 250;
    const steps = 5;
    const compound = fn.execute(
      {
        expression: "p * (1 + r/1200)^(12*x) + m * ((1 + r/1200)^(12*x) - 1) / (r/1200)",
        xMin: 0,
        xMax: t,
        steps,
        p,
        r,
        m,
      },
      null
    ) as number[];
    expect(compound.length).toBe(steps);
    expect(compound.every((v) => typeof v === "number" && Number.isFinite(v))).toBe(true);
    expect(compound[0]).toBeCloseTo(p, 0);
    expect(compound[compound.length - 1]).toBeGreaterThan(compound[0]);
  });
});

