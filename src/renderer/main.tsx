import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/exo-2/latin-400.css";
import "@fontsource/exo-2/latin-500.css";
import "@fontsource/exo-2/latin-600.css";
import "@fontsource/exo-2/latin-700.css";
import "@fontsource/orbitron/latin-500.css";
import "@fontsource/orbitron/latin-600.css";
import "@fontsource/orbitron/latin-700.css";
import "./a2ui-material-symbols-fonts";
import "./index.css";
import { ShellInjector } from "./ShellInjector";

function traceRenderer(message: string, data?: unknown): void {
  try {
    void window.electronAPI?.debugLog?.({
      source: "renderer-main",
      message,
      data,
    });
  } catch {
    // no-op
  }
}

window.addEventListener("error", (event) => {
  traceRenderer("window.error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  traceRenderer("window.unhandledrejection", {
    reason: String(event.reason),
  });
});

const theme = localStorage.getItem("theme") || "dark";
document.body.className = `theme-${theme}`;
try {
  void window.electronAPI?.syncAppIconTheme?.(theme);
} catch {
  /* ignore */
}
traceRenderer("renderer bootstrap start", { theme });

const rootEl = document.getElementById("root");
if (rootEl) {
  traceRenderer("react root found; rendering ShellInjector");
  createRoot(rootEl).render(
    <StrictMode>
      <ShellInjector />
    </StrictMode>,
  );
}
