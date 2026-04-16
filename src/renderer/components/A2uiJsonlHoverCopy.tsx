import { useCallback, useState, type ReactElement } from "react";

/**
 * Floating "Copy JSONL" control for A2UI chat panels. Shown on hover (fine pointer) or
 * always visible at reduced emphasis on touch / coarse pointers.
 */
export function A2uiJsonlHoverCopyOverlay(props: { jsonl: string }): ReactElement | null {
  const [copied, setCopied] = useState(false);
  const text = props.jsonl.trim();

  const onCopy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [text]);

  if (!text) return null;

  return (
    <div className="a2ui-chat-surface__jsonl-hover-actions">
      <button
        type="button"
        className="a2ui-chat-surface__jsonl-copy-btn"
        onClick={() => void onCopy()}
        title="Copy NDJSON source (analysis, debugging, or sharing)"
        aria-label="Copy NDJSON source"
      >
        {copied ? "Copied" : "Copy JSONL"}
      </button>
    </div>
  );
}
