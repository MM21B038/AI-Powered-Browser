import { z } from "zod";
import { Catalog } from "@a2ui/web_core/v0_9";
import { basicCatalog } from "@a2ui/react/v0_9";
import { a2uiV09DynamicNumberSchema } from "./a2ui-v0_9-dynamic-number-schema";
import {
  clampSurfaceSteps,
  clampSteps,
  differentiateNumeric,
  evaluateMathExpression,
  integrateNumeric,
  MATH_EXPR_MAX_LENGTH,
  partialDifferentiateNumeric,
  safeNum,
} from "./a2ui-v0_9-math-catalog-helpers";
import {
  emptyMesh3d,
  meshBox,
  meshCone,
  meshCuboid,
  meshCylinder,
  meshMerge,
  meshParametricUv,
  meshSphere,
  meshTorus,
  type Mesh3dData,
} from "./a2ui-v0_9-mesh-primitives";

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

const DiffNumericFn = {
  name: "diff_numeric",
  returnType: "number",
  schema: z
    .object({
      expression: z.string().max(MATH_EXPR_MAX_LENGTH),
      x: a2uiV09DynamicNumberSchema,
      h: a2uiV09DynamicNumberSchema.optional(),
    })
    .passthrough()
    .describe(
      "Numeric derivative d/dx of `expression` at `x` via central differences. Extra keys become variables; bind with `{ path }` for reactivity."
    ),
  execute: (args: Record<string, unknown>) => {
    const expression = String(args.expression ?? "");
    const x = safeNum(args.x, 0);
    const h = args.h == null ? undefined : safeNum(args.h, 1e-4);
    const scopeBase: Record<string, number> = {};
    for (const [k, v] of Object.entries(args)) {
      if (["expression", "x", "h"].includes(k)) continue;
      scopeBase[k] = safeNum(v, 0);
    }
    return differentiateNumeric({ expression, x, h, scopeBase });
  },
} as const;

const PartialDiffNumericFn = {
  name: "partial_diff_numeric",
  returnType: "number",
  schema: z
    .object({
      expression: z.string().max(MATH_EXPR_MAX_LENGTH),
      wrt: z.enum(["x", "y", "z"]),
      h: a2uiV09DynamicNumberSchema.optional(),
    })
    .passthrough()
    .describe(
      "Numeric partial derivative ∂f/∂wrt at the point given by top-level variable keys (e.g. x, y, z); bind with `{ path }` for reactivity."
    ),
  execute: (args: Record<string, unknown>) => {
    const expression = String(args.expression ?? "");
    const wrt = args.wrt === "y" || args.wrt === "z" ? args.wrt : "x";
    const h = args.h == null ? undefined : safeNum(args.h, 1e-4);
    const scope: Record<string, number> = {};
    for (const [k, v] of Object.entries(args)) {
      if (["expression", "wrt", "h"].includes(k)) continue;
      scope[k] = safeNum(v, 0);
    }
    return partialDifferentiateNumeric({ expression, wrt, h, scope });
  },
} as const;

const IntegrateNumericFn = {
  name: "integrate_numeric",
  returnType: "number",
  schema: z
    .object({
      expression: z.string().max(MATH_EXPR_MAX_LENGTH),
      xMin: a2uiV09DynamicNumberSchema,
      xMax: a2uiV09DynamicNumberSchema,
      steps: a2uiV09DynamicNumberSchema.optional(),
    })
    .passthrough()
    .describe(
      "Numeric integral of `expression` over x from `xMin` to `xMax` (trapezoid). Extra keys become variables; bind with `{ path }` for reactivity."
    ),
  execute: (args: Record<string, unknown>) => {
    const expression = String(args.expression ?? "");
    const xMin = safeNum(args.xMin, 0);
    const xMax = safeNum(args.xMax, 1);
    const steps = args.steps == null ? 256 : safeNum(args.steps, 256);
    const scopeBase: Record<string, number> = {};
    for (const [k, v] of Object.entries(args)) {
      if (["expression", "xMin", "xMax", "steps"].includes(k)) continue;
      scopeBase[k] = safeNum(v, 0);
    }
    return integrateNumeric({ expression, xMin, xMax, steps, scopeBase });
  },
} as const;

const SeriesSurfaceFn = {
  name: "series_surface",
  returnType: "object",
  schema: z
    .object({
      expression: z.string().max(MATH_EXPR_MAX_LENGTH),
      xMin: a2uiV09DynamicNumberSchema,
      xMax: a2uiV09DynamicNumberSchema,
      yMin: a2uiV09DynamicNumberSchema,
      yMax: a2uiV09DynamicNumberSchema,
      xSteps: a2uiV09DynamicNumberSchema.optional(),
      ySteps: a2uiV09DynamicNumberSchema.optional(),
    })
    .passthrough()
    .describe(
      "Sample a 3D surface z=f(x,y) across x/y bounds. Returns { x: number[], y: number[], z: number[][] } for plotting."
    ),
  execute: (args: Record<string, unknown>) => {
    const expression = String(args.expression ?? "");
    const xMin = safeNum(args.xMin, -1);
    const xMax = safeNum(args.xMax, 1);
    const yMin = safeNum(args.yMin, -1);
    const yMax = safeNum(args.yMax, 1);
    const xSteps = clampSurfaceSteps(safeNum(args.xSteps, 48));
    const ySteps = clampSurfaceSteps(safeNum(args.ySteps, 48));
    const scopeBase: Record<string, number> = {};
    for (const [k, v] of Object.entries(args)) {
      if (
        ["expression", "xMin", "xMax", "yMin", "yMax", "xSteps", "ySteps"].includes(k)
      )
        continue;
      scopeBase[k] = safeNum(v, 0);
    }

    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < xSteps; i++) {
      const t = xSteps <= 1 ? 0 : i / (xSteps - 1);
      x.push(xMin + (xMax - xMin) * t);
    }
    for (let j = 0; j < ySteps; j++) {
      const t = ySteps <= 1 ? 0 : j / (ySteps - 1);
      y.push(yMin + (yMax - yMin) * t);
    }

    const z: number[][] = [];
    for (let j = 0; j < y.length; j++) {
      const row: number[] = [];
      for (let i = 0; i < x.length; i++) {
        const n = evaluateMathExpression(expression, {
          ...scopeBase,
          x: x[i]!,
          y: y[j]!,
        });
        row.push(Number.isFinite(n) ? n : 0);
      }
      z.push(row);
    }
    return { x, y, z };
  },
} as const;

function parseMesh3dArg(raw: unknown): Mesh3dData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Mesh3dData;
  if (!Array.isArray(o.x) || !Array.isArray(o.y) || !Array.isArray(o.z)) return null;
  if (!Array.isArray(o.i) || !Array.isArray(o.j) || !Array.isArray(o.k)) return null;
  if (o.x.length !== o.y.length || o.y.length !== o.z.length) return null;
  if (o.i.length !== o.j.length || o.j.length !== o.k.length) return null;
  return o;
}

const MeshSphereFn = {
  name: "mesh_sphere",
  returnType: "object",
  schema: z
    .object({
      radius: a2uiV09DynamicNumberSchema.optional(),
      r: a2uiV09DynamicNumberSchema.optional(),
      cx: a2uiV09DynamicNumberSchema.optional(),
      cy: a2uiV09DynamicNumberSchema.optional(),
      cz: a2uiV09DynamicNumberSchema.optional(),
      segments: a2uiV09DynamicNumberSchema.optional(),
      /** LLM-friendly aliases (same meaning as `segments` for UV grid). */
      widthSegments: a2uiV09DynamicNumberSchema.optional(),
      heightSegments: a2uiV09DynamicNumberSchema.optional(),
    })
    .passthrough()
    .describe(
      "UV sphere mesh for Plot3D `mesh` traces: `radius` or `r`, optional `cx`/`cy`/`cz` (default 0), optional `segments` or `widthSegments`/`heightSegments` (defaults 24)."
    ),
  execute: (args: Record<string, unknown>) => {
    const segRaw =
      args.segments ?? args.widthSegments ?? args.heightSegments ?? 24;
    const segments = safeNum(segRaw, 24);
    return meshSphere(
      safeNum(args.cx, 0),
      safeNum(args.cy, 0),
      safeNum(args.cz, 0),
      safeNum(args.radius ?? args.r, 1),
      segments,
    );
  },
} as const;

const MeshBoxFn = {
  name: "mesh_box",
  returnType: "object",
  schema: z
    .object({
      x0: a2uiV09DynamicNumberSchema,
      y0: a2uiV09DynamicNumberSchema,
      z0: a2uiV09DynamicNumberSchema,
      x1: a2uiV09DynamicNumberSchema,
      y1: a2uiV09DynamicNumberSchema,
      z1: a2uiV09DynamicNumberSchema,
    })
    .passthrough()
    .describe("Axis-aligned box mesh from corner (x0,y0,z0) to (x1,y1,z1)."),
  execute: (args: Record<string, unknown>) => {
    return meshBox(
      safeNum(args.x0, 0),
      safeNum(args.y0, 0),
      safeNum(args.z0, 0),
      safeNum(args.x1, 1),
      safeNum(args.y1, 1),
      safeNum(args.z1, 1),
    );
  },
} as const;

const MeshCuboidFn = {
  name: "mesh_cuboid",
  returnType: "object",
  schema: z
    .object({
      hx: a2uiV09DynamicNumberSchema,
      hy: a2uiV09DynamicNumberSchema,
      hz: a2uiV09DynamicNumberSchema,
      cx: a2uiV09DynamicNumberSchema.optional(),
      cy: a2uiV09DynamicNumberSchema.optional(),
      cz: a2uiV09DynamicNumberSchema.optional(),
    })
    .passthrough()
    .describe("Axis-aligned box centered at (cx,cy,cz) (default 0) with half-extents (hx,hy,hz)."),
  execute: (args: Record<string, unknown>) => {
    return meshCuboid(
      safeNum(args.cx, 0),
      safeNum(args.cy, 0),
      safeNum(args.cz, 0),
      safeNum(args.hx, 0.5),
      safeNum(args.hy, 0.5),
      safeNum(args.hz, 0.5),
    );
  },
} as const;

const MeshCylinderFn = {
  name: "mesh_cylinder",
  returnType: "object",
  schema: z
    .object({
      radius: a2uiV09DynamicNumberSchema.optional(),
      r: a2uiV09DynamicNumberSchema.optional(),
      height: a2uiV09DynamicNumberSchema.optional(),
      h: a2uiV09DynamicNumberSchema.optional(),
      cx: a2uiV09DynamicNumberSchema.optional(),
      cy: a2uiV09DynamicNumberSchema.optional(),
      cz: a2uiV09DynamicNumberSchema.optional(),
      radialSegments: a2uiV09DynamicNumberSchema.optional(),
      segments: a2uiV09DynamicNumberSchema.optional(),
      heightSegments: a2uiV09DynamicNumberSchema.optional(),
      caps: z.union([z.boolean(), z.number()]).optional(),
    })
    .passthrough()
    .describe(
      "Cylinder along Z through (cx,cy,cz) ± height/2; center defaults to origin. Aliases: `r`→`radius`, `h`→`height`, `segments`→`radialSegments`. caps false = open tube."
    ),
  execute: (args: Record<string, unknown>) => {
    const capsRaw = args.caps;
    const caps =
      capsRaw === undefined ? true : capsRaw === true || capsRaw === 1 || capsRaw === "1";
    const radius = safeNum(args.radius ?? args.r, 1);
    const height = safeNum(args.height ?? args.h, 1);
    const radialSeg =
      args.radialSegments ?? args.radial ?? args.segments ?? args.widthSegments;
    const heightSeg = args.heightSegments ?? args.heightRings;
    return meshCylinder({
      cx: safeNum(args.cx, 0),
      cy: safeNum(args.cy, 0),
      cz: safeNum(args.cz, 0),
      radius,
      height,
      radialSegments: radialSeg == null ? undefined : safeNum(radialSeg, 24),
      heightSegments: heightSeg == null ? undefined : safeNum(heightSeg, 1),
      caps,
    });
  },
} as const;

const MeshConeFn = {
  name: "mesh_cone",
  returnType: "object",
  schema: z
    .object({
      height: a2uiV09DynamicNumberSchema.optional(),
      h: a2uiV09DynamicNumberSchema.optional(),
      baseRadius: a2uiV09DynamicNumberSchema.optional(),
      radius: a2uiV09DynamicNumberSchema.optional(),
      r: a2uiV09DynamicNumberSchema.optional(),
      cx: a2uiV09DynamicNumberSchema.optional(),
      cy: a2uiV09DynamicNumberSchema.optional(),
      cz: a2uiV09DynamicNumberSchema.optional(),
      radialSegments: a2uiV09DynamicNumberSchema.optional(),
      segments: a2uiV09DynamicNumberSchema.optional(),
      caps: z.union([z.boolean(), z.number()]).optional(),
    })
    .passthrough()
    .describe(
      "Cone: base in z = cz − h/2, apex at z = cz + h/2; center defaults to origin. Use `baseRadius` or `radius`; `h`→`height`; `segments`→`radialSegments`."
    ),
  execute: (args: Record<string, unknown>) => {
    const capsRaw = args.caps;
    const caps =
      capsRaw === undefined ? true : capsRaw === true || capsRaw === 1 || capsRaw === "1";
    const baseRadius = safeNum(args.baseRadius ?? args.radius ?? args.r, 1);
    const height = safeNum(args.height ?? args.h, 1);
    const radialSeg = args.radialSegments ?? args.radial ?? args.segments;
    return meshCone({
      cx: safeNum(args.cx, 0),
      cy: safeNum(args.cy, 0),
      cz: safeNum(args.cz, 0),
      baseRadius,
      height,
      radialSegments: radialSeg == null ? undefined : safeNum(radialSeg, 24),
      caps,
    });
  },
} as const;

const MeshTorusFn = {
  name: "mesh_torus",
  returnType: "object",
  schema: z
    .object({
      majorRadius: a2uiV09DynamicNumberSchema.optional(),
      minorRadius: a2uiV09DynamicNumberSchema.optional(),
      cx: a2uiV09DynamicNumberSchema.optional(),
      cy: a2uiV09DynamicNumberSchema.optional(),
      cz: a2uiV09DynamicNumberSchema.optional(),
      uSegments: a2uiV09DynamicNumberSchema.optional(),
      vSegments: a2uiV09DynamicNumberSchema.optional(),
      /** Aliases for major / minor tube radius */
      R: a2uiV09DynamicNumberSchema.optional(),
      r: a2uiV09DynamicNumberSchema.optional(),
    })
    .passthrough()
    .describe(
      "Torus in XY plane; center defaults to origin. Use `majorRadius`/`minorRadius` or aliases `R`/`r`."
    ),
  execute: (args: Record<string, unknown>) => {
    const major = safeNum(args.majorRadius ?? args.R, 2);
    const minor = safeNum(args.minorRadius ?? args.r, 0.5);
    return meshTorus({
      cx: safeNum(args.cx, 0),
      cy: safeNum(args.cy, 0),
      cz: safeNum(args.cz, 0),
      majorRadius: major,
      minorRadius: minor,
      uSegments: args.uSegments == null ? undefined : safeNum(args.uSegments, 32),
      vSegments: args.vSegments == null ? undefined : safeNum(args.vSegments, 24),
    });
  },
} as const;

const MeshMergeFn = {
  name: "mesh_merge",
  returnType: "object",
  schema: z
    .object({
      a: z.any(),
      b: z.any(),
    })
    .passthrough()
    .describe("Concatenate two mesh3d payloads `{x,y,z,i,j,k}` (e.g. from other mesh_* calls)."),
  execute: (args: Record<string, unknown>) => {
    const ma = parseMesh3dArg(args.a);
    const mb = parseMesh3dArg(args.b);
    if (!ma || !mb) return emptyMesh3d();
    return meshMerge(ma, mb);
  },
} as const;

const MeshParametricUvFn = {
  name: "mesh_parametric_uv",
  returnType: "object",
  schema: z
    .object({
      xExpression: z.string().max(MATH_EXPR_MAX_LENGTH),
      yExpression: z.string().max(MATH_EXPR_MAX_LENGTH),
      zExpression: z.string().max(MATH_EXPR_MAX_LENGTH),
      uMin: a2uiV09DynamicNumberSchema,
      uMax: a2uiV09DynamicNumberSchema,
      vMin: a2uiV09DynamicNumberSchema,
      vMax: a2uiV09DynamicNumberSchema,
      uSteps: a2uiV09DynamicNumberSchema.optional(),
      vSteps: a2uiV09DynamicNumberSchema.optional(),
    })
    .passthrough()
    .describe(
      "Parametric patch (u,v) → (x,y,z) via mathjs expressions; sweep uses variables `u` and `v`. Extra top-level keys are numeric parameters (reactive)."
    ),
  execute: (args: Record<string, unknown>) => {
    const xExpression = String(args.xExpression ?? "0");
    const yExpression = String(args.yExpression ?? "0");
    const zExpression = String(args.zExpression ?? "0");
    const uMin = safeNum(args.uMin, 0);
    const uMax = safeNum(args.uMax, 1);
    const vMin = safeNum(args.vMin, 0);
    const vMax = safeNum(args.vMax, 1);
    const uSteps = args.uSteps == null ? 32 : safeNum(args.uSteps, 32);
    const vSteps = args.vSteps == null ? 32 : safeNum(args.vSteps, 32);
    const scopeBase: Record<string, number> = {};
    for (const [k, v] of Object.entries(args)) {
      if (
        [
          "xExpression",
          "yExpression",
          "zExpression",
          "uMin",
          "uMax",
          "vMin",
          "vMax",
          "uSteps",
          "vSteps",
        ].includes(k)
      )
        continue;
      scopeBase[k] = safeNum(v, 0);
    }
    return meshParametricUv({
      xExpression,
      yExpression,
      zExpression,
      uMin,
      uMax,
      vMin,
      vMax,
      uSteps,
      vSteps,
      scopeBase,
    });
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
    DiffNumericFn,
    PartialDiffNumericFn,
    IntegrateNumericFn,
    SeriesSurfaceFn,
    MeshSphereFn,
    MeshBoxFn,
    MeshCuboidFn,
    MeshCylinderFn,
    MeshConeFn,
    MeshTorusFn,
    MeshMergeFn,
    MeshParametricUvFn,
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

