import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

export function BrowserImportOverlay(): ReactElement | null {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onB = (e: Event) => {
      const ce = e as CustomEvent<{ busy: boolean }>;
      if (typeof ce.detail?.busy === "boolean") setBusy(ce.detail.busy);
    };
    window.addEventListener("browser-import-busy", onB);
    return () => window.removeEventListener("browser-import-busy", onB);
  }, []);

  if (!busy) return null;

  return createPortal(
    <div className="import-overlay" style={{ display: "flex" }}>
      <div className="import-box">
        <div className="loading-ring" />
        <p>Scanning installed browsers...</p>
      </div>
    </div>,
    document.body,
  );
}
