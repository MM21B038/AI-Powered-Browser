import { z } from "zod";
import { Catalog } from "@a2ui/web_core/v0_9";
import { basicCatalog } from "@a2ui/react/v0_9";
import { a2uiV09DynamicNumberSchema } from "./a2ui-v0_9-dynamic-number-schema";
import {
  clampSteps,
  evaluateMathExpression,
  MATH_EXPR_MAX_LENGTH,
  safeNum,
} from "./a2ui-v0_9-math-catalog-helpers";

function currencyNarrowSymbolFor(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      currencyDisplay: "narrowSymbol",
    }).formatToParts(1);
    return parts.find((p) => p.type === "currency")?.value ?? "$";
  } catch {
    return "$";
  }
}

/** Manual K/M/B/T + currency symbol when `Intl` compact notation is unavailable. */
function formatCompactCurrencyManual(value: number, currency: string, maxFractionDigits: number): string {
  if (!Number.isFinite(value)) return "";
  const ax = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const cur = currency.toUpperCase();
  if (ax < 1000) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cur,
        maximumFractionDigits: maxFractionDigits,
      }).format(value);
    } catch {
      return `${sign}${currencyNarrowSymbolFor(cur)}${ax.toFixed(maxFractionDigits)}`;
    }
  }
  const tiers: readonly [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  let divisor = 1;
  let suffix = "";
  for (const [thr, suf] of tiers) {
    if (ax >= thr) {
      divisor = thr;
      suffix = suf;
      break;
    }
  }
  const scaled = ax / divisor;
  const fd = scaled >= 100 ? 0 : Math.min(2, maxFractionDigits);
  const raw =
    fd === 0 ? String(Math.round(scaled)) : String(Number.parseFloat(scaled.toFixed(fd)));
  const sym = currencyNarrowSymbolFor(cur);
  return `${sign}${sym}${raw}${suffix}`;
}

function buildSparklineDataUrl(series: number[]): string {
  const w = 720;
  const h = 220;
  const padX = 18;
  const padY = 18;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const nums = series.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (nums.length === 0) return "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(1e-9, max - min);

  const pts = nums
    .map((v, i) => {
      const x = padX + (innerW * i) / Math.max(1, nums.length - 1);
      const y = padY + innerH * (1 - (v - min) / span);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const grid = [0.25, 0.5, 0.75]
    .map((t) => {
      const y = padY + innerH * t;
      return `<line x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(124, 92, 255, 0.35)"/>
      <stop offset="1" stop-color="rgba(124, 92, 255, 0)"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="rgba(18,18,26,0.55)"/>
  ${grid}
  <polyline points="${pts}" fill="none" stroke="rgba(124, 92, 255, 0.95)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)"/>
  <polyline points="${pts} ${w - padX},${h - padY} ${padX},${h - padY}" fill="url(#g)" stroke="none"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const ToStringFn = {
  name: "toString",
  returnType: "string",
  schema: z.object({ value: z.any() }),
  execute: ({ value }: { value: unknown }) => {
    if (value == null) return "";
    return typeof value === "string" ? value : String(value);
  },
} as const;

const ConcatFn = {
  name: "concat",
  returnType: "string",
  schema: z.object({ a: z.any(), b: z.any() }),
  execute: ({ a, b }: { a: unknown; b: unknown }) => `${a ?? ""}${b ?? ""}`,
} as const;

const ArrayLengthFn = {
  name: "array_length",
  returnType: "number",
  schema: z.object({ array: z.any() }),
  execute: ({ array }: { array: unknown }) =>
    Array.isArray(array) ? array.length : 0,
} as const;

const CountWhereFn = {
  name: "count_where",
  returnType: "number",
  schema: z.object({
    array: z.any(),
    key: z.string(),
    equals: z.any().optional(),
    truthy: z.boolean().optional(),
  }),
  execute: ({
    array,
    key,
    equals,
    truthy,
  }: {
    array: unknown;
    key: string;
    equals?: unknown;
    truthy?: boolean;
  }) => {
    if (!Array.isArray(array)) return 0;
    let c = 0;
    for (const item of array) {
      const v = item && typeof item === "object" ? (item as any)[key] : undefined;
      if (truthy) {
        if (v) c++;
      } else if (equals !== undefined) {
        if (v === equals) c++;
      }
    }
    return c;
  },
} as const;

const SparklineSvgFn = {
  name: "sparkline_svg",
  returnType: "string",
  schema: z.object({
    series: z.array(z.number()),
  }),
  execute: ({ series }: { series: number[] }) => buildSparklineDataUrl(series),
} as const;

const ClampFn = {
  name: "clamp",
  returnType: "number",
  schema: z.object({
    value: z.number(),
    min: z.number(),
    max: z.number(),
  }),
  execute: ({ value, min, max }: { value: number; min: number; max: number }) =>
    Math.min(max, Math.max(min, value)),
} as const;

const SumByKeyFn = {
  name: "sum_by_key",
  returnType: "number",
  schema: z.object({
    array: z.any(),
    key: z.string(),
  }),
  execute: ({ array, key }: { array: unknown; key: string }) => {
    if (!Array.isArray(array)) return 0;
    let sum = 0;
    for (const item of array) {
      const v = item && typeof item === "object" ? (item as any)[key] : undefined;
      const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  },
} as const;

const GroupCountFn = {
  name: "group_count",
  returnType: "object",
  schema: z.object({
    array: z.any(),
    key: z.string(),
  }),
  execute: ({ array, key }: { array: unknown; key: string }) => {
    const out: Record<string, number> = {};
    if (!Array.isArray(array)) return out;
    for (const item of array) {
      const v = item && typeof item === "object" ? (item as any)[key] : undefined;
      const k = typeof v === "string" ? v : v == null ? "" : String(v);
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  },
} as const;

const FormatCurrencyFn = {
  name: "format_currency",
  returnType: "string",
  schema: z.object({
    value: z.number(),
    currency: z.string().optional(),
    maxFractionDigits: z.number().optional(),
  }),
  execute: ({
    value,
    currency,
    maxFractionDigits,
  }: {
    value: number;
    currency?: string;
    maxFractionDigits?: number;
  }) => {
    const cur = (currency || "USD").toUpperCase();
    const mfd = typeof maxFractionDigits === "number" ? maxFractionDigits : 2;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: mfd,
      }).format(value);
    } catch {
      return `${cur} ${value.toFixed(mfd)}`;
    }
  },
} as const;

const FormatPercentFn = {
  name: "format_percent",
  returnType: "string",
  schema: z.object({
    value: z.number(),
    fractionDigits: z.number().optional(),
  }),
  execute: ({
    value,
    fractionDigits,
  }: {
    value: number;
    fractionDigits?: number;
  }) => {
    const fd = typeof fractionDigits === "number" ? fractionDigits : 2;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "percent",
        maximumFractionDigits: fd,
      }).format(value);
    } catch {
      return `${(value * 100).toFixed(fd)}%`;
    }
  },
} as const;

const FormatCompactCurrencyFn = {
  name: "format_compact_currency",
  returnType: "string",
  schema: z.object({
    value: z.number(),
    currency: z.string().optional(),
    maxFractionDigits: z.number().optional(),
    locale: z.string().optional(),
  }),
  execute: ({
    value,
    currency,
    maxFractionDigits,
    locale,
  }: {
    value: number;
    currency?: string;
    maxFractionDigits?: number;
    locale?: string;
  }) => {
    const cur = (currency || "USD").toUpperCase();
    const mfd =
      typeof maxFractionDigits === "number" ? Math.max(0, Math.min(4, Math.floor(maxFractionDigits))) : 2;
    if (!Number.isFinite(value)) return "";
    const loc = locale?.trim() || undefined;
    try {
      const opts: Intl.NumberFormatOptions = {
        style: "currency",
        currency: cur,
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits: mfd,
        minimumFractionDigits: 0,
      };
      return new Intl.NumberFormat(loc, opts).format(value);
    } catch {
      return formatCompactCurrencyManual(value, cur, mfd);
    }
  },
} as const;

const MovingAverageFn = {
  name: "moving_average",
  returnType: "array",
  schema: z.object({
    series: z.array(z.number()),
    window: z.number().min(1).max(60),
  }),
  execute: ({ series, window }: { series: number[]; window: number }) => {
    const w = Math.max(1, Math.floor(window));
    const out: number[] = [];
    for (let i = 0; i < series.length; i++) {
      const start = Math.max(0, i - w + 1);
      let sum = 0;
      let count = 0;
      for (let j = start; j <= i; j++) {
        const v = series[j]!;
        if (Number.isFinite(v)) {
          sum += v;
          count++;
        }
      }
      out.push(count > 0 ? sum / count : 0);
    }
    return out;
  },
} as const;

/**
 * Reactive math: pass model inputs as **top-level** arg keys (e.g. `a`, `b`) with `{ path }` or numbers
 * so the DataContext invalidates when those paths change. Nested objects under `args` are not tracked.
 */
const MathEvalFn = {
  name: "math_eval",
  returnType: "number",
  schema: z
    .object({
      expression: z.string().max(MATH_EXPR_MAX_LENGTH),
    })
    .passthrough()
    .describe(
      "Evaluate a mathjs expression. Extra keys (besides `expression`) become variables; bind with `{ path }` for reactivity."
    ),
  execute: (args: Record<string, unknown>) => {
    const expression = String(args.expression ?? "");
    const scope: Record<string, number> = {};
    for (const [k, v] of Object.entries(args)) {
      if (k === "expression") continue;
      scope[k] = safeNum(v, 0);
    }
    const n = evaluateMathExpression(expression, scope);
    return Number.isFinite(n) ? n : 0;
  },
} as const;

const SeriesExprFn = {
  name: "series_expr",
  returnType: "array",
  schema: z
    .object({
      expression: z.string().max(MATH_EXPR_MAX_LENGTH),
      xMin: a2uiV09DynamicNumberSchema,
      xMax: a2uiV09DynamicNumberSchema,
      steps: a2uiV09DynamicNumberSchema,
    })
    .passthrough()
    .describe(
      "Build `steps` Y values for x from `xMin` to `xMax`. Sweep bounds and `steps` accept literals or `{ path }` like other dynamic numbers. Expression uses swept `x` plus extra reactive variable keys."
    ),
  execute: (args: Record<string, unknown>) => {
    const expression = String(args.expression ?? "");
    const xMin = safeNum(args.xMin, 0);
    const xMax = safeNum(args.xMax, 1);
    const steps = clampSteps(safeNum(args.steps, 32));
    const scopeBase: Record<string, number> = {};
    for (const [k, v] of Object.entries(args)) {
      if (["expression", "xMin", "xMax", "steps"].includes(k)) continue;
      scopeBase[k] = safeNum(v, 0);
    }
    const out: number[] = [];
    for (let i = 0; i < steps; i++) {
      const t = steps <= 1 ? 0 : i / (steps - 1);
      const x = xMin + (xMax - xMin) * t;
      const n = evaluateMathExpression(expression, { ...scopeBase, x });
      out.push(Number.isFinite(n) ? n : 0);
    }
    return out;
  },
} as const;

/** Extra expression/catalog functions registered for both extended and host catalogs. */
export function getA2uiV09ExtraCatalogFunctions(): readonly any[] {
  return [
    ToStringFn,
    ConcatFn,
    ArrayLengthFn,
    CountWhereFn,
    SparklineSvgFn,
    ClampFn,
    SumByKeyFn,
    GroupCountFn,
    FormatCurrencyFn,
    FormatPercentFn,
    FormatCompactCurrencyFn,
    MovingAverageFn,
    MathEvalFn,
    SeriesExprFn,
  ];
}

/** Full upstream basic catalog id + all components (legacy / tests). */
export function buildA2uiV09ExtendedCatalog(): any {
  const components = Array.from((basicCatalog as any).components?.values?.() ?? []) as any[];
  const baseFns = Array.from((basicCatalog as any).functions?.values?.() ?? []) as any[];
  const extra = getA2uiV09ExtraCatalogFunctions();
  // Keep the same id as the basic catalog so createSurface catalogId still matches.
  return new Catalog((basicCatalog as any).id, components, [...baseFns, ...extra]);
}

