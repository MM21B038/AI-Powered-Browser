import { useEffect, useRef, useState, type ReactElement } from "react";
import type { ThinkingLevel } from "../state/session-settings-store";

const OPTIONS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function shortLabel(level: ThinkingLevel): string {
  switch (level) {
    case "off":
      return "Off";
    case "low":
      return "Low";
    case "medium":
      return "Med";
    case "high":
      return "High";
    default:
      return "Off";
  }
}

export function ThinkingPicker({
  level,
  onSelect,
  disabled,
}: {
  level: ThinkingLevel;
  onSelect: (l: ThinkingLevel) => void;
  disabled?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open]);

  return (
    <div className="thinking-picker" ref={wrapRef}>
      <button
        type="button"
        className="ai-chat-icon-btn ai-chat-icon-btn--thinking"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Thinking: ${shortLabel(level)}`}
        title="Reasoning for this chat: Gemini uses extra_body thinking_config + include_thoughts; OpenAI-style APIs use reasoning_effort; OpenRouter uses reasoning.effort; DeepSeek uses thinking mode. Off sends no thinking parameters."
        onClick={() => setOpen((v) => !v)}
      >
        <span className="thinking-picker__icon" aria-hidden>
          ◆
        </span>
        <span className="thinking-picker__label">{shortLabel(level)}</span>
        <span className="thinking-picker__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="thinking-picker__menu" role="listbox" aria-label="Thinking level">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === level}
              className={`thinking-picker__opt${opt.value === level ? " thinking-picker__opt--active" : ""}`}
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
