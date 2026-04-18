import { type KeyboardEvent, type ReactElement } from "react";
import type { IntelligentChatMode } from "../chat/conversation-store";

export function IntelligentChatModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: IntelligentChatMode;
  onChange: (m: IntelligentChatMode) => void;
  disabled?: boolean;
}): ReactElement {
  const onSegmentKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange("ui");
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange("assistant");
    }
  };

  return (
    <div
      className="ai-chat-ui-mode-switch"
      data-mode={mode}
      role="radiogroup"
      aria-label="Chat mode"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="ai-chat-ui-mode-switch__thumb" aria-hidden />
      <div className="ai-chat-ui-mode-switch__row">
        <button
          type="button"
          role="radio"
          className={`ai-chat-ui-mode-switch__btn${mode === "assistant" ? " ai-chat-ui-mode-switch__btn--active" : ""}`}
          aria-checked={mode === "assistant"}
          title="Assistant — standard chat and tools"
          disabled={disabled}
          onClick={() => onChange("assistant")}
          onKeyDown={onSegmentKeyDown}
        >
          Assist
        </button>
        <button
          type="button"
          role="radio"
          className={`ai-chat-ui-mode-switch__btn${mode === "ui" ? " ai-chat-ui-mode-switch__btn--active" : ""}`}
          aria-checked={mode === "ui"}
          title="UI mode — A2UI build & preview in chat"
          disabled={disabled}
          onClick={() => onChange("ui")}
          onKeyDown={onSegmentKeyDown}
        >
          UI
        </button>
      </div>
    </div>
  );
}
