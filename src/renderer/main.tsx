import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "../../styles.css";
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
