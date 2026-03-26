import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "../../styles.css";
import { ShellInjector } from "./ShellInjector";

const theme = localStorage.getItem("theme") || "dark";
document.body.className = `theme-${theme}`;

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ShellInjector />
    </StrictMode>,
  );
}
