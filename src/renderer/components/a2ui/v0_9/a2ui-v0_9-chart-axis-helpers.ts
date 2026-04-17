/**
 * Recharts axis domain and tick formatting for host cartesian charts.
 */

export type YDomainSetting = readonly [0, "auto"] | undefined;

/** Collect numeric series values from row data (`s0`, `s1`, …). */
export function collectSeriesValuesFromRows(
  rows: readonly Record<string, string | number>[],
  keys: readonly string[]
): number[] {
  const out: number[] = [];
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/**
 * When every plotted value is >= 0, pin the value axis to start at 0 so Recharts does not extend into negative ticks.
 * Otherwise leave domain automatic (negative series or loss/gap data).
 */
export function yDomainNonNegativeIfAllPositive(
  rows: readonly Record<string, string | number>[],
  keys: readonly string[]
): YDomainSetting {
  const vals = collectSeriesValuesFromRows(rows, keys);
  if (vals.length === 0) return undefined;
  const min = Math.min(...vals);
  if (min >= 0) return [0, "auto"];
  return undefined;
}

/** Compact Y (or numeric X) tick labels for large magnitudes. */
export function formatCartesianTick(n: number): string {
  if (!Number.isFinite(n)) return "";
  const ax = Math.abs(n);
  if (ax === 0) return "0";
  if (ax >= 1000) {
    try {
      return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(n);
    } catch {
      if (ax >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
      if (ax >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (ax >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    }
  }
  if (ax < 1 && ax > 0) return n.toFixed(2);
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

export type DenseCategoryAxisProps = {
  angle?: number;
  textAnchor?: "end";
  height?: number;
};

/** Tilt category labels when there are many points or long labels (matches Histogram pattern). */
export function denseCategoryAxisProps(rows: readonly Record<string, string | number>[]): DenseCategoryAxisProps {
  if (rows.length === 0) return {};
  const many = rows.length > 12;
  let sumLen = 0;
  let long = false;
  for (const r of rows) {
    const len = String(r.name ?? "").length;
    sumLen += len;
    if (len > 12) long = true;
  }
  const avg = sumLen / rows.length;
  if (many || long || avg > 9) {
    return { angle: -35, textAnchor: "end", height: 56 };
  }
  return {};
}
