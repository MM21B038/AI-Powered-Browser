import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/exo-2/latin-400.css";
import "@fontsource/exo-2/latin-500.css";
import "@fontsource/exo-2/latin-600.css";
import "@fontsource/exo-2/latin-700.css";
import "@fontsource/orbitron/latin-500.css";
import "@fontsource/orbitron/latin-600.css";
import "@fontsource/orbitron/latin-700.css";
import "./index.css";
import "../../styles.css";
import "../../style-chat-code-syntax.css";
import "../../styles/style-screenshot-library.css";
import "../../styles/style-ai-chat-tool-mentions.css";
import "../../styles/style-calculator-widget.css";
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
