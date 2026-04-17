import { useCallback, useState, type ReactElement } from "react";
import { runScientificCalculator } from "../services/scientific-calculator";

const LS_EXPANDED = "calc-widget-expanded";

/** Seed state when opening the keypad from a chat tool result (user-only reuse). */
export type CalculatorToolSeed = {
  expression: string;
  result?: string;
  error?: string;
};

function initialStateFromSeed(seed: CalculatorToolSeed | undefined): {
  buffer: string;
  lastSubmitted: string;
  lastAnswer: string;
} {
  if (!seed?.expression && !seed?.result && !seed?.error) {
    return { buffer: "", lastSubmitted: "", lastAnswer: "" };
  }
  if (seed.error) {
    return {
      buffer: seed.expression || "",
      lastSubmitted: "",
      lastAnswer: "",
    };
  }
  const r = seed.result?.trim() ?? "";
  const ex = seed.expression?.trim() ?? "";
  if (r) {
    return { buffer: r, lastSubmitted: ex, lastAnswer: r };
  }
  return { buffer: ex, lastSubmitted: "", lastAnswer: "" };
}

export type CalculatorWidgetProps = {
  variant?: "floating" | "embedded" | "chat";
  /** Used when variant is embedded (Tool Hub). */
  defaultPrecision?: number;
  showPrecisionControl?: boolean;
  className?: string;
  /** When `variant` is `"chat"`, prefill from the assistant tool run. */
  toolSeed?: CalculatorToolSeed;
};

function clampPrecision(n: number): number {
  return Math.max(16, Math.min(256, Math.floor(n)));
}

export function CalculatorWidget({
  variant = "embedded",
  defaultPrecision = 64,
  showPrecisionControl = false,
  className,
  toolSeed,
}: CalculatorWidgetProps): ReactElement {
  const seeded = initialStateFromSeed(toolSeed);
  const [expanded, setExpanded] = useState(() => {
    if (variant === "chat" || variant === "embedded") return true;
    try {
      return localStorage.getItem(LS_EXPANDED) === "1";
    } catch {
      return false;
    }
  });
  const [buffer, setBuffer] = useState(seeded.buffer);
  const [lastSubmitted, setLastSubmitted] = useState(seeded.lastSubmitted);
  const [lastAnswer, setLastAnswer] = useState(seeded.lastAnswer);
  const [err, setErr] = useState<string | null>(() =>
    toolSeed?.error?.trim() ? toolSeed.error.trim() : null,
  );
  const [precision, setPrecision] = useState(() => clampPrecision(defaultPrecision));

  const toggleExpanded = useCallback(() => {
    setExpanded((e) => {
      const n = !e;
      if (variant === "floating") {
        try {
          localStorage.setItem(LS_EXPANDED, n ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      return n;
    });
  }, [variant]);

  const append = useCallback((s: string) => {
    setErr(null);
    setBuffer((b) => b + s);
  }, []);

  const backspace = useCallback(() => {
    setErr(null);
    setBuffer((b) => b.slice(0, -1));
  }, []);

  const clearAll = useCallback(() => {
    setErr(null);
    setBuffer("");
    setLastAnswer("");
    setLastSubmitted("");
  }, []);

  const equals = useCallback(() => {
    const ex = buffer.trim();
    setErr(null);
    if (!ex) {
      setErr("Empty expression");
      return;
    }
    const out = runScientificCalculator({ expression: ex, precision });
    if (out.success && out.result != null) {
      setLastAnswer(out.result);
      setLastSubmitted(ex);
      setBuffer(out.result);
    } else {
      setErr(out.error ?? "Could not evaluate");
    }
  }, [buffer, precision]);

  const headerExpr = lastSubmitted || buffer || "0";
  const headerAns = lastAnswer || "—";
  const displayCollapsed =
    headerExpr.length > 36 ? `${headerExpr.slice(0, 34)}…` : headerExpr;
  const displayExpanded = buffer;

  const rootClass = [
    "calc-widget",
    variant === "floating"
      ? "calc-widget--floating"
      : variant === "chat"
        ? "calc-widget--chat"
        : "calc-widget--embedded",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const lcdMain = buffer.trim() ? buffer : "0";
  const lcdSub =
    lastSubmitted && lastAnswer && buffer === lastAnswer
      ? `${lastSubmitted} =`
      : lastSubmitted && buffer !== lastSubmitted
        ? lastSubmitted
        : "";

  type MkOpts = { wide?: boolean; sub?: string; fn?: boolean };

  const mk = (bid: string, label: string, onClick: () => void, opts?: MkOpts): ReactElement => (
    <button
      key={bid}
      type="button"
      className={[
        "calc-widget__key",
        opts?.wide ? "calc-widget__key--wide" : "",
        opts?.fn ? "calc-widget__key--fn" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <span className="calc-widget__key-label">{label}</span>
      {opts?.sub ? <span className="calc-widget__key-sub">{opts.sub}</span> : null}
    </button>
  );

  /** Appends `fnName(` for unary functions (mathjs radians). */
  const fn = (name: string) => () => append(`${name}(`);

  const keysEl = (
    <div className="calc-widget__keys">
      {mk("fn-sin", "sin", fn("sin"), { fn: true })}
      {mk("fn-cos", "cos", fn("cos"), { fn: true })}
      {mk("fn-tan", "tan", fn("tan"), { fn: true })}
      {mk("fn-asin", "sin⁻¹", fn("asin"), { fn: true })}
      {mk("fn-acos", "cos⁻¹", fn("acos"), { fn: true })}
      {mk("fn-atan", "tan⁻¹", fn("atan"), { fn: true })}
      {mk("fn-ln", "ln", fn("ln"), { fn: true })}
      {mk("fn-log10", "log", fn("log10"), { fn: true, sub: "10" })}
      {mk("fn-sqrt", "√", fn("sqrt"), { fn: true })}
      {mk("fn-exp", "eˣ", fn("exp"), { fn: true })}
      {mk("const-pi", "π", () => append("pi"), { fn: true })}
      {mk("const-e", "e", () => append("e"), { fn: true })}
      {mk("op-clear", "C", clearAll)}
      {mk("op-bs", "⌫", backspace)}
      {mk("sym-lp", "(", () => append("("))}
      {mk("sym-rp", ")", () => append(")"))}
      {mk("d7", "7", () => append("7"))}
      {mk("d8", "8", () => append("8"))}
      {mk("d9", "9", () => append("9"))}
      {mk("op-div", "÷", () => append("/"))}
      {mk("d4", "4", () => append("4"))}
      {mk("d5", "5", () => append("5"))}
      {mk("d6", "6", () => append("6"))}
      {mk("op-mul", "×", () => append("*"))}
      {mk("d1", "1", () => append("1"))}
      {mk("d2", "2", () => append("2"))}
      {mk("d3", "3", () => append("3"))}
      {mk("op-minus", "−", () => append("-"))}
      {mk("d0", "0", () => append("0"))}
      {mk("dot", ".", () => append("."))}
      {mk("pow", "^", () => append("^"))}
      {mk("op-plus", "+", () => append("+"))}
      {mk("op-eq", "=", equals, { wide: true })}
    </div>
  );

  if (variant === "chat") {
    return (
      <div className={rootClass}>
        <div className="calc-widget__lcd" aria-live="polite">
          {lcdSub ? (
            <div className="calc-widget__lcd-sub" title={lcdSub}>
              {lcdSub}
            </div>
          ) : null}
          <div className="calc-widget__lcd-main" title={lcdMain}>
            {lcdMain}
          </div>
        </div>
        <div className="calc-widget__body calc-widget__body--chat">
          {err ? (
            <div className="calc-widget__err" role="alert">
              {err}
            </div>
          ) : null}
          {keysEl}
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <button
        type="button"
        className="calc-widget__header"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse calculator" : "Expand calculator"}
      >
        <div className="calc-widget__header-inner">
          <span className="calc-widget__header-title">Calculator</span>
          <span className="calc-widget__chev" aria-hidden />
        </div>
        <div className="calc-widget__header-display">
          <span className="calc-widget__header-expr" title={headerExpr}>
            {expanded ? displayExpanded || "…" : displayCollapsed || "…"}
          </span>
          {!expanded ? (
            <span className="calc-widget__header-ans" title={lastAnswer}>
              = {headerAns}
            </span>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="calc-widget__body">
          {err ? (
            <div className="calc-widget__err" role="alert">
              {err}
            </div>
          ) : null}
          {showPrecisionControl ? (
            <label className="calc-widget__precision">
              <span>Precision</span>
              <input
                type="number"
                min={16}
                max={256}
                value={precision}
                onChange={(e) => setPrecision(clampPrecision(Number(e.target.value) || 64))}
              />
            </label>
          ) : null}
          {keysEl}
        </div>
      ) : null}
    </div>
  );
}
