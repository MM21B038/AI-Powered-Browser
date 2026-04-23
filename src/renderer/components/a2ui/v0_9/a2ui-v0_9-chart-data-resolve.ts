/**
 * Resolves nested `{ path }` / `{ call, args }` inside cartesian chart `series` rows.
 * `GenericBinder` treats `series` as one DYNAMIC union (because of `{ path }` in the schema),
 * so array payloads skip nested resolution — we fix that here using `DataContext`.
 */
import { useEffect, useMemo, useState } from "react";

export type SeriesRow = { name: string; values: number[] };

/** Minimal surface for `@a2ui/web_core` `DataContext`. */
export type ChartDataContextLike = {
  resolveDynamicValue: (value: unknown) => unknown;
  subscribeDynamicValue: (
    value: unknown,
    onChange: (val: unknown) => void
  ) => { unsubscribe: () => void };
};

export function asString(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

export function resolveNumArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    if (typeof x === "number" && Number.isFinite(x)) {
      out.push(x);
      continue;
    }
    if (typeof x === "string") {
      const n = Number.parseFloat(x.trim());
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

export function resolveStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => asString(x));
}

export function isDynamicLeaf(v: unknown): v is { path?: string; call?: string } {
  return v !== null && typeof v === "object" && !Array.isArray(v) && ("path" in v || "call" in v);
}

export function resolveBoundNumArray(raw: unknown, dc: ChartDataContextLike | null): number[] {
  if (isDynamicLeaf(raw)) {
    const resolved = dc?.resolveDynamicValue(raw);
    return resolveNumArray(resolved);
  }
  return resolveNumArray(raw);
}

function resolveBoundStringArrayLike(raw: unknown, dc: ChartDataContextLike | null): string[] {
  if (isDynamicLeaf(raw)) {
    const resolved = dc?.resolveDynamicValue(raw);
    if (Array.isArray(resolved)) return resolved.map((x) => asString(x));
    return resolveStringArray(resolved);
  }
  return resolveStringArray(raw);
}

/** Resolves `series` after the binder; pass `dc` so nested `values` functionCalls run. */
export function resolveSeriesWithDataContext(raw: unknown, dc: ChartDataContextLike | null): SeriesRow[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 0 && typeof raw[0] === "number") {
    const values = resolveBoundNumArray(raw, dc);
    return values.length ? [{ name: "Series", values }] : [];
  }
  const out: SeriesRow[] = [];
  let idx = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const nameRaw = asString((item as { name?: unknown }).name);
    const name = nameRaw.trim() || `Series ${idx + 1}`;
    const valsRaw = (item as { values?: unknown }).values;
    const values = resolveBoundNumArray(valsRaw, dc);
    idx++;
    if (values.length > 0) out.push({ name, values });
  }
  return out;
}

export function resolveCategoriesWithDataContext(
  raw: unknown | undefined,
  dc: ChartDataContextLike | null
): string[] | undefined {
  if (raw == null) return undefined;
  const arr = resolveBoundStringArrayLike(raw, dc);
  return arr.length > 0 ? arr : undefined;
}

function collectCartesianDynamicLeaves(
  seriesRaw: unknown,
  categoriesRaw: unknown | undefined,
  xValuesRaw: unknown | undefined,
): unknown[] {
  const leaves: unknown[] = [];
  if (Array.isArray(seriesRaw)) {
    for (const row of seriesRaw) {
      if (row && typeof row === "object" && "values" in row) {
        const v = (row as { values?: unknown }).values;
        if (isDynamicLeaf(v)) leaves.push(v);
      }
    }
  }
  if (categoriesRaw != null && isDynamicLeaf(categoriesRaw)) leaves.push(categoriesRaw);
  if (xValuesRaw != null && isDynamicLeaf(xValuesRaw)) leaves.push(xValuesRaw);
  return leaves;
}

export function useCartesianChartResolvedData(
  seriesRaw: unknown,
  categoriesRaw: unknown | undefined,
  xValuesRaw: unknown | undefined,
  context: { dataContext: ChartDataContextLike } | undefined
): { series: SeriesRow[]; categories: string[] | undefined; xValuesNum: number[] | undefined } {
  const dc = context?.dataContext ?? null;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!dc) return;
    const leaves = collectCartesianDynamicLeaves(seriesRaw, categoriesRaw, xValuesRaw);
    const unsubs = leaves.map((leaf) =>
      dc.subscribeDynamicValue(leaf, () => {
        setTick((n) => n + 1);
      })
    );
    return () => {
      for (const s of unsubs) s.unsubscribe();
    };
  }, [dc, seriesRaw, categoriesRaw, xValuesRaw]);

  return useMemo(() => {
    const series = resolveSeriesWithDataContext(seriesRaw, dc);
    const categories =
      categoriesRaw != null ? resolveCategoriesWithDataContext(categoriesRaw, dc) : undefined;
    const xValuesNum =
      xValuesRaw != null && xValuesRaw !== undefined
        ? (() => {
            const arr = resolveBoundNumArray(xValuesRaw, dc);
            return arr.length > 0 ? arr : undefined;
          })()
        : undefined;
    return { series, categories, xValuesNum };
  }, [dc, seriesRaw, categoriesRaw, xValuesRaw, tick]);
}
