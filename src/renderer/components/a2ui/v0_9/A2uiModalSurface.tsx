import { useEffect, useMemo, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { A2uiSurface } from "@a2ui/react/v0_9";
import { getA2uiV09Runtime } from "../../../services/a2ui-v0_9-runtime";

type A2uiModalSurfaceProps = {
  open: boolean;
  surfaceId: string;
  onClose: () => void;
};

/**
 * Host modal wrapper for an A2UI v0.9 surface.
 * The actual surface state lives in the shared v0.9 MessageProcessor runtime.
 */
export function A2uiModalSurface({
  open,
  surfaceId,
  onClose,
}: A2uiModalSurfaceProps): ReactElement | null {
  const runtime = useMemo(() => getA2uiV09Runtime(), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const host =
    document.getElementById("webviewOverlayHost") ?? document.body;
  const surface = runtime.getSurface(surfaceId) as unknown;

  return createPortal(
    <>
      <div
        className="settings-overlay"
        style={{ display: "block" }}
        onClick={() => onClose()}
        role="presentation"
      />
      <div
        className="settings-panel settings-panel--modal-xl"
        style={{ display: "flex" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <div className="settings-header-text">
            <h3>A2UI</h3>
            <p className="settings-header-sub">v0.9 surface: {surfaceId}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={() => onClose()}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 2L10 10M10 2L2 10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="settings-body">
          {surface ? (
            <div style={{ padding: "12px" }}>
              <A2uiSurface surface={surface} />
            </div>
          ) : (
            <div style={{ padding: "12px", opacity: 0.75 }}>
              Waiting for surface…
            </div>
          )}
        </div>
      </div>
    </>,
    host,
  );
}

