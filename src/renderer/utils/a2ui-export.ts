import * as htmlToImage from "html-to-image";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function captureBackground(el: HTMLElement): string {
  try {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      return bg;
    }
  } catch {
    /* ignore */
  }
  return "#ffffff";
}

function baseCaptureOpts(el: HTMLElement) {
  return {
    cacheBust: true,
    pixelRatio: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2),
    backgroundColor: captureBackground(el),
  } as const;
}

// NOTE: This module previously supported SVG snapshot embedding; we now export live HTML instead.

/**
 * Raster snapshot of a rendered A2UI panel → system clipboard as PNG.
 */
export async function copyA2uiPanelImageToClipboard(el: HTMLElement): Promise<boolean> {
  const blob = await htmlToImage.toBlob(el, baseCaptureOpts(el));
  if (!blob) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Self-contained HTML: fully interactive A2UI panel (React renderer) + embedded NDJSON.
 *
 * This export is intended to be opened in a regular browser and remain functional
 * (inputs, sliders, etc.). It uses ESM CDNs for React + `@a2ui/react/v0_8`.
 */
export async function buildA2uiStandaloneHtml(meta: {
  surfaceId: string;
  jsonl: string;
}): Promise<string> {
  const jsonl = (meta.jsonl || "").trim();
  const title = escapeHtml(meta.surfaceId);
  const jsonlEsc = escapeHtml(jsonl);
  const isV09 = /"version"\s*:\s*"v0\.9"/.test(jsonl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>A2UI export — ${title}</title>
<style>
  body { margin: 0; background: #eceff1; font-family: system-ui, "Segoe UI", sans-serif; color: #222; }
  .a2ui-export-page { max-width: 52rem; margin: 0 auto; padding: 1rem 1rem 2rem; box-sizing: border-box; }
  .a2ui-export-note { font-size: 0.85rem; color: #444; margin: 0 0 0.75rem; line-height: 1.4; }
  .a2ui-export-note code { font-size: 0.85em; background: #fff; padding: 0.1em 0.35em; border-radius: 4px; }
  .a2ui-export-panel { background: #fff; border-radius: 12px; border: 1px solid #cfd8dc; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 14px; }
  .a2ui-export-meta { margin-top: 1rem; }
  .a2ui-export-meta summary { cursor: pointer; font-weight: 600; margin-bottom: 0.5rem; }
  .a2ui-export-pre { white-space: pre-wrap; word-break: break-word; background: #fff; border: 1px solid #cfd8dc; border-radius: 10px; padding: 0.75rem; max-height: 20rem; overflow: auto; font-size: 0.75rem; line-height: 1.35; }
</style>
</head>
<body>
<div class="a2ui-export-page">
<p class="a2ui-export-note">Interactive <strong>A2UI</strong> export (${isV09 ? "v0.9" : "v0.8"}). This file contains the exact HTML/CSS/JS needed to render the panel plus the original NDJSON payload.</p>
<div class="a2ui-export-panel">
  <div id="a2ui-root"></div>
</div>
<details class="a2ui-export-meta"><summary>NDJSON source</summary><pre class="a2ui-export-pre" id="a2ui-jsonl">${jsonlEsc}</pre></details>
</div>
<script type="application/json" id="a2ui-jsonl-raw">${jsonlEsc}</script>
<script type="module">
  import React from "https://esm.sh/react@18.3.1";
  import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

  function parseNdjson(text) {
    const lines = String(text || "")
      .split(/\\r?\\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return lines.map((l) => JSON.parse(l));
  }

  const raw = document.getElementById("a2ui-jsonl-raw")?.textContent || "";
  const msgs = (() => {
    try { return parseNdjson(raw); } catch (e) { console.error("Invalid NDJSON:", e); return []; }
  })();

  const isV09 = ${JSON.stringify(isV09)};

  async function mountV09() {
    const { MessageProcessor } = await import("https://esm.sh/@a2ui/web_core@0.9.0-alpha.0/v0_9");
    const { basicCatalog, A2uiSurface } = await import("https://esm.sh/@a2ui/react@0.9.0-alpha.0/v0_9");
    const { injectStyles } = await import("https://esm.sh/@a2ui/react@0.9.0-alpha.0/styles");
    injectStyles();

    const mp = new MessageProcessor([basicCatalog], (a) => console.log("[A2UI v0.9 action]", a));
    mp.processMessages(msgs);
    const surface = mp.model.getSurface(${JSON.stringify(meta.surfaceId)});
    const App = () => React.createElement(A2uiSurface, { surface });
    const rootEl = document.getElementById("a2ui-root");
    if (rootEl) createRoot(rootEl).render(React.createElement(App));
  }

  async function mountV08() {
    const mod = await import("https://esm.sh/@a2ui/react@0.9.0-alpha.0/v0_8");
    const { injectStyles } = await import("https://esm.sh/@a2ui/react@0.9.0-alpha.0/styles");
    injectStyles();
    const {
      A2UIProvider,
      A2UIRenderer,
      initializeDefaultCatalog,
      defaultTheme,
      useA2UIActions,
    } = mod;

    function ApplyMessages({ jsonl }) {
      const actions = useA2UIActions();
      React.useEffect(() => {
        try {
          const msgs2 = parseNdjson(jsonl);
          actions.processMessages(msgs2);
        } catch (e) {
          console.error("A2UI export failed to apply messages:", e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [jsonl]);
      return null;
    }

    function App() {
      React.useEffect(() => {
        try {
          initializeDefaultCatalog();
        } catch {}
      }, []);
      return React.createElement(
        A2UIProvider,
        { theme: defaultTheme, onAction: (m) => console.log("[A2UI v0.8 action]", m) },
        React.createElement(React.Fragment, null,
          React.createElement(ApplyMessages, { jsonl: raw }),
          React.createElement(A2UIRenderer, { surfaceId: ${JSON.stringify(meta.surfaceId)} })
        )
      );
    }

    const rootEl = document.getElementById("a2ui-root");
    if (rootEl) createRoot(rootEl).render(React.createElement(App));
  }

  if (isV09) mountV09();
  else mountV08();
</script>
</body>
</html>`;
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
