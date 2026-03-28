import { useEffect, useRef, useState, type ReactElement } from "react";

const VISIBLE_ROWS = 5;
const ROW_PX = 32;

function truncateId(id: string, max: number): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 1)}…`;
}

export function ModelQuickPick({
  selectedModelId,
  modelIds,
  onSelect,
  onOpenAssistantSettings,
  disabled,
}: {
  selectedModelId: string;
  modelIds: string[];
  onSelect: (id: string) => void;
  onOpenAssistantSettings: () => void;
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

  const ids =
    modelIds.length > 0
      ? modelIds
      : selectedModelId.trim()
        ? [selectedModelId.trim()]
        : [];
  const label = selectedModelId.trim() ? truncateId(selectedModelId, 22) : "Model";

  return (
    <div className="model-quick-pick" ref={wrapRef}>
      <button
        type="button"
        className="ai-chat-icon-btn ai-chat-icon-btn--model"
        title="Choose model (scroll the list for more)"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="model-quick-pick__label">{label}</span>
        <span className="model-quick-pick__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="model-quick-pick__menu"
          role="listbox"
          aria-label="Models"
          style={{ maxHeight: VISIBLE_ROWS * ROW_PX }}
        >
          {ids.length === 0 ? (
            <button type="button" className="model-quick-pick__empty" onClick={() => onOpenAssistantSettings()}>
              Load models in Workspace settings…
            </button>
          ) : (
            ids.map((id) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={id === selectedModelId}
                className={`model-quick-pick__opt${id === selectedModelId ? " model-quick-pick__opt--active" : ""}`}
                title={id}
                onClick={() => {
                  onSelect(id);
                  setOpen(false);
                }}
              >
                {id}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
