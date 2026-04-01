import { useMemo, useState, type ReactElement } from "react";
import { CalculatorWidget, type CalculatorToolSeed } from "../CalculatorWidget";
import { CalculatorIcon } from "../icons/CalculatorIcon";
import { McpIcon } from "../icons/McpIcon";

/** OpenAI / MCP function name for the built-in calculator tool. */
export const INTELLIGENT_CALCULATOR_TOOL_NAME = "intelligent_scientific_calculate";

export function isCalculatorToolName(name: string): boolean {
  return name.trim() === INTELLIGENT_CALCULATOR_TOOL_NAME;
}

function safeJsonObject(raw: string | undefined): Record<string, unknown> | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o)) return o as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Calculator tool message: header with collapse control; expanded = full keypad (same card).
 */
export function AiChatCalculatorToolRow({
  instanceKey,
  toolArguments,
  content,
}: {
  instanceKey?: string;
  toolArguments?: string;
  content: string;
}): ReactElement {
  const parsed = useMemo(() => {
    const args = safeJsonObject(toolArguments);
    const expr = typeof args?.expression === "string" ? args.expression.trim() : "";

    const body = safeJsonObject(content);
    let success = false;
    let result = "";
    let errMsg = "";
    if (body) {
      success = body.success === true;
      result = typeof body.result === "string" ? body.result : "";
      errMsg = typeof body.error === "string" ? body.error : "";
    }

    let outputDisplay = "";
    if (body) {
      if (success && result) outputDisplay = result;
      else if (errMsg) outputDisplay = errMsg;
      else if (success) outputDisplay = "OK";
    }
    if (!outputDisplay && content.trim()) {
      const t = content.trim();
      outputDisplay = t.length > 200 ? `${t.slice(0, 200)}…` : t;
    }
    if (!outputDisplay) outputDisplay = "—";

    const toolSeed: CalculatorToolSeed = {
      expression: expr,
      ...(success && result ? { result } : {}),
      ...(!success && errMsg ? { error: errMsg } : {}),
    };

    return {
      expr: expr || "—",
      outputDisplay,
      isError: Boolean(errMsg),
      toolSeed,
    };
  }, [toolArguments, content]);

  const calcKey =
    instanceKey ??
    `calc-${parsed.toolSeed.expression ?? ""}-${parsed.toolSeed.result ?? parsed.toolSeed.error ?? ""}`.slice(
      0,
      80,
    );

  const [calcExpanded, setCalcExpanded] = useState(true);
  const calcPanelId = `ai-chat-calc-panel-${instanceKey ?? calcKey}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);

  return (
    <div className="ai-chat-calc-tool-card" role="group" aria-label="Calculator tool">
      <div className="ai-chat-calc-tool-card__head">
        <div className="ai-chat-calc-tool-card__brand">
          <McpIcon size={14} className="ai-chat-calc-tool-card__mcp" />
          <span className="ai-chat-calc-tool-card__heading">Calculator</span>
        </div>
      </div>

      <div className="ai-chat-calc-tool-card__result-screen">
        <button
          type="button"
          className={`ai-chat-calc-tool-card__icon-toggle${calcExpanded ? " ai-chat-calc-tool-card__icon-toggle--expanded" : ""}`}
          aria-expanded={calcExpanded}
          aria-controls={calcPanelId}
          onClick={() => setCalcExpanded((v) => !v)}
          title={calcExpanded ? "Collapse calculator" : "Expand calculator"}
          aria-label={calcExpanded ? "Collapse calculator" : "Expand calculator"}
        >
          <CalculatorIcon size={20} className="ai-chat-calc-tool-card__icon-toggle-glyph" aria-hidden />
        </button>

        <div className="ai-chat-calc-tool-card__result-main">
          {!calcExpanded ? (
            <div className="ai-chat-calc-tool-card__result-summary">
              <div className="ai-chat-calc-tool-card__collapsed-in">
                <span className="ai-chat-calc-tool-card__collapsed-k">Input</span>
                <span className="ai-chat-calc-tool-card__collapsed-v" title={parsed.expr}>
                  {parsed.expr}
                </span>
              </div>
              <div className="ai-chat-calc-tool-card__collapsed-out">
                <span className="ai-chat-calc-tool-card__collapsed-k">Output</span>
                <span
                  className={`ai-chat-calc-tool-card__collapsed-v${parsed.isError ? " ai-chat-calc-tool-card__collapsed-v--err" : ""}`}
                  title={parsed.outputDisplay}
                >
                  {parsed.outputDisplay}
                </span>
              </div>
            </div>
          ) : null}
          <div
            id={calcPanelId}
            className={`ai-chat-calc-tool-card__calc${calcExpanded ? "" : " ai-chat-calc-tool-card__calc--hidden"}`}
            hidden={!calcExpanded}
          >
            <CalculatorWidget
              key={calcKey}
              variant="chat"
              toolSeed={parsed.toolSeed}
              className="calc-widget--in-tool-card"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
