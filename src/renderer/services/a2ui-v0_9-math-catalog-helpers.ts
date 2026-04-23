import { all, create, type MathType } from "mathjs/number";

export const MATH_EXPR_MAX_LENGTH = 12_000;
const MAX_EXPR = MATH_EXPR_MAX_LENGTH;
const DEFAULT_PRECISION = 64;

export function safeNum(x: unknown, fallback = 0): number {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number.parseFloat(x.trim());
    if (Number.isFinite(n)) return n;
  }
  // ChoicePicker / legacy bindings sometimes store a one-element array for a scalar path.
  if (Array.isArray(x) && x.length > 0) return safeNum(x[0], fallback);
  return fallback;
}

function createMathEngine() {
  const math = create(all, {
    number: "number",
    precision: DEFAULT_PRECISION,
    predictable: true,
  });
  math.config({ number: "number", precision: DEFAULT_PRECISION });
  const m = math as unknown as {
    log: (x: unknown, base?: unknown) => unknown;
    nthRoot: (v: unknown, r: unknown) => unknown;
  };
  math.import(
    {
      nroot: (value: unknown, root: unknown) => m.nthRoot(value, root),
      ln: (x: unknown) => m.log(x),
    },
    { override: true }
  );
  return math;
}

let mathSingleton: ReturnType<typeof createMathEngine> | null = null;

function getMath() {
  if (!mathSingleton) mathSingleton = createMathEngine();
  return mathSingleton;
}

/**
 * Evaluate a mathjs expression with numeric scope (variable names must match identifiers in `expression`).
 * Used by catalog functions `math_eval` and `series_expr`.
 */
export function evaluateMathExpression(expression: string, scope: Record<string, number>): number {
  const expr = String(expression ?? "").trim();
  if (!expr || expr.length > MAX_EXPR) return NaN;
  try {
    const math = getMath();
    const v = math.evaluate(expr, scope) as MathType;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
  } catch {
    return NaN;
  }
}

export function clampSteps(n: number): number {
  return Math.min(500, Math.max(2, Math.floor(n)));
}

export function clampSurfaceSteps(n: number): number {
  return Math.min(180, Math.max(2, Math.floor(n)));
}

function safeFinite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Central difference derivative for a mathjs expression in x.
 * Returns 0 on invalid inputs/NaNs (keeps A2UI surfaces stable).
 */
export function differentiateNumeric(opts: {
  expression: string;
  x: number;
  h?: number;
  scopeBase?: Record<string, number>;
}): number {
  const expr = String(opts.expression ?? "");
  const x = safeFinite(opts.x, 0);
  const hRaw = typeof opts.h === "number" ? opts.h : 1e-4;
  const h = Math.max(1e-12, Math.abs(safeFinite(hRaw, 1e-4)));
  const base = opts.scopeBase ?? {};
  const a = evaluateMathExpression(expr, { ...base, x: x + h });
  const b = evaluateMathExpression(expr, { ...base, x: x - h });
  const d = (a - b) / (2 * h);
  return Number.isFinite(d) ? d : 0;
}

/**
 * Trapezoidal integration for a mathjs expression in x.
 * Returns 0 on invalid inputs/NaNs (keeps A2UI surfaces stable).
 */
export type PartialDiffWrt = "x" | "y" | "z";

/**
 * Central partial derivative ∂f/∂wrt at the point given by `scope` (must include `wrt` and any other symbols used in the expression).
 */
export function partialDifferentiateNumeric(opts: {
  expression: string;
  wrt: PartialDiffWrt;
  h?: number;
  scope?: Record<string, number>;
}): number {
  const expr = String(opts.expression ?? "");
  const w = opts.wrt;
  const hRaw = typeof opts.h === "number" ? opts.h : 1e-4;
  const h = Math.max(1e-12, Math.abs(safeFinite(hRaw, 1e-4)));
  const base: Record<string, number> = { ...(opts.scope ?? {}) };
  const v0 = safeFinite(base[w] ?? 0, 0);
  const a = evaluateMathExpression(expr, { ...base, [w]: v0 + h });
  const b = evaluateMathExpression(expr, { ...base, [w]: v0 - h });
  const d = (a - b) / (2 * h);
  return Number.isFinite(d) ? d : 0;
}

export function integrateNumeric(opts: {
  expression: string;
  xMin: number;
  xMax: number;
  steps: number;
  scopeBase?: Record<string, number>;
}): number {
  const expr = String(opts.expression ?? "");
  const xMin = safeFinite(opts.xMin, 0);
  const xMax = safeFinite(opts.xMax, 1);
  const n = clampSteps(opts.steps);
  const base = opts.scopeBase ?? {};
  if (n < 2) return 0;
  const dx = (xMax - xMin) / (n - 1);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = xMin + dx * i;
    const fx = evaluateMathExpression(expr, { ...base, x });
    const w = i === 0 || i === n - 1 ? 0.5 : 1;
    sum += w * (Number.isFinite(fx) ? fx : 0);
  }
  const area = dx * sum;
  return Number.isFinite(area) ? area : 0;
}
