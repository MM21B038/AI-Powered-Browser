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
