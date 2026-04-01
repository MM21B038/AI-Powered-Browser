import { all, create, type MathType } from "mathjs";

/**
 * Expression evaluator (mathjs, radians for trig):
 * Arithmetic: + − * / ^, sqrt, nthRoot / nroot.
 * Trig: sin, cos, tan, sec, csc, cot.
 * Inverse trig: asin, acos, atan, atan2.
 * Exp / log: exp, e, ln (alias for natural log), log (natural), log10, log2, log(x, base).
 * Constants: pi, e, tau, i (imaginary).
 */
const MAX_EXPRESSION_LENGTH = 12_000;
const DEFAULT_PRECISION = 64;

export type ScientificCalcRequest = {
  expression: string;
  precision?: number;
};

export type ScientificCalcResult = {
  success: boolean;
  expression: string;
  /** Formatted numeric / decimal string. */
  result?: string;
  error?: string;
};

function normalizedPrecision(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_PRECISION;
  return Math.max(16, Math.min(256, Math.floor(n)));
}

function createMath(precision: number) {
  const math = create(all, {
    number: "BigNumber",
    precision,
    predictable: true,
  });
  math.config({ number: "BigNumber", precision });
  const m = math as unknown as { log: (x: unknown, base?: unknown) => unknown; nthRoot: (v: unknown, r: unknown) => unknown };
  math.import(
    {
      nroot: (value: unknown, root: unknown) => m.nthRoot(value, root),
      /** Natural logarithm; mathjs `log(x)` is already natural, this matches common `ln` notation. */
      ln: (x: unknown) => m.log(x),
    },
    { override: true },
  );
  return math;
}

function formatMathValue(math: ReturnType<typeof createMath>, value: MathType): string {
  return String(math.format(value, { notation: "auto", precision: 48 }));
}

export function runScientificCalculator(input: ScientificCalcRequest): ScientificCalcResult {
  const expression = String(input.expression ?? "").trim();
  try {
    if (!expression) {
      return { success: false, expression: "", error: "expression is required" };
    }
    if (expression.length > MAX_EXPRESSION_LENGTH) {
      return { success: false, expression, error: "expression too long" };
    }
    const math = createMath(normalizedPrecision(input.precision));
    const value = math.evaluate(expression);
    const result = formatMathValue(math, value as MathType);
    return { success: true, expression, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, expression, error: msg };
  }
}
