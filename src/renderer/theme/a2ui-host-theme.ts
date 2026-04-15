/**
 * Maps Autonomous Browser design tokens (`app.css` / `body.theme-*`) onto the A2UI `Theme`
 * via `additionalStyles` (renderer-controlled styling; agents keep using semantic hints only).
 */

import { defaultTheme } from "@a2ui/react/v0_8";
import type { Theme } from "@a2ui/react/v0_8";

/**
 * Builds a full {@link Theme} cloned from the Lit default, with inline styles that reference
 * host CSS variables so A2UI panels track light/dark and user theme presets.
 */
export function buildA2uiHostTheme(): Theme {
  const base = structuredClone(defaultTheme) as Theme;
  const border = "var(--border-subtle, var(--border))";
  base.additionalStyles = {
    ...base.additionalStyles,
    Button: {
      background: "var(--accent)",
      color: "var(--bg0)",
      border: "1px solid transparent",
      borderRadius: "0.4rem",
      fontFamily: "inherit",
      fontWeight: "600",
      padding: "0.42rem 0.9rem",
      cursor: "pointer",
      boxShadow: "0 1px 0 color-mix(in srgb, var(--text) 12%, transparent)",
    },
    Card: {
      background: "var(--bg3)",
      border: `1px solid ${border}`,
      borderRadius: "0.55rem",
      boxShadow: "0 1px 2px color-mix(in srgb, var(--bg0) 35%, transparent)",
    },
    Column: {
      fontFamily: "inherit",
      gap: "0.5rem",
    },
    Row: {
      fontFamily: "inherit",
      gap: "0.45rem",
    },
    List: {
      fontFamily: "inherit",
      gap: "0.35rem",
    },
    TextField: {
      fontFamily: "inherit",
      border: `1px solid ${border}`,
      borderRadius: "0.4rem",
      background: "var(--bg0)",
      color: "var(--text)",
    },
    CheckBox: {
      fontFamily: "inherit",
      accentColor: "var(--accent)",
    },
    Divider: {
      borderColor: border,
    },
    Text: {
      h1: {
        color: "var(--text)",
        fontFamily: "inherit",
        fontWeight: "700",
        fontSize: "1.35rem",
        lineHeight: "1.25",
        letterSpacing: "-0.02em",
      },
      h2: {
        color: "var(--text)",
        fontFamily: "inherit",
        fontWeight: "600",
        fontSize: "1.12rem",
        lineHeight: "1.3",
      },
      h3: {
        color: "var(--text)",
        fontFamily: "inherit",
        fontWeight: "600",
        fontSize: "1.02rem",
        lineHeight: "1.35",
      },
      h4: { color: "var(--text)", fontFamily: "inherit", fontWeight: "600" },
      h5: { color: "var(--text)", fontFamily: "inherit", fontWeight: "600" },
      body: { color: "var(--text)", fontFamily: "inherit", lineHeight: "1.45" },
      caption: { color: "var(--text2)", fontFamily: "inherit", lineHeight: "1.4" },
    },
  };
  return base;
}
