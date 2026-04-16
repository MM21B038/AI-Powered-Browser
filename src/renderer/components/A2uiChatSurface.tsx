/**
 * Renders one A2UI JSONL blob inside the chat (requires ancestor {@link A2UIProvider}).
 *
 * **Processing matches `google/A2UI` `samples/client/react/shell`:** validate the full
 * server message list, then replace this surface with `deleteSurface` + `processMessages`
 * (same idea as that sample’s `clearSurfaces()` + `processMessages(response)`; here we
 * only delete **this** surface so other chat bubbles stay intact).
 *
 * Transport from the model is still markdown + fenced JSONL in this app; the shell sample
 * uses HTTP/A2A (`GoogleA2uiClient`). The **renderer loop** is the same.
 *
 * After strict Zod validation, {@link validateHostCatalogPolicy} enforces an optional
 * subset of v0.8 component keys (`A2UI_HOST_COMPONENT_ALLOWLIST` in `a2ui-host-catalog-policy.ts`).
 */

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";
import { A2UIRenderer, initializeDefaultCatalog, useA2UIActions } from "@a2ui/react/v0_8";
import type { ServerToClientMessage } from "@a2ui/react/v0_8";
import {
  A2UI_HOST_LLM_COMPAT,
  coerceLlmShortcutsInA2uiJsonl,
  ensureBeginRenderingForJsonl,
  orderA2uiJsonlServerMessages,
  repairA2uiLayoutInJsonl,
  rewriteA2uiJsonlSurfaceIds,
} from "../../shared/a2ui-jsonl";
import {
  A2UI_HOST_ACTION_HINT_EVENT,
  type A2uiHostActionHintDetail,
} from "../../shared/a2ui-host-local-actions";
import { validateHostCatalogPolicy } from "../../shared/a2ui-host-catalog-policy";
import { validateA2uiJsonlLinesStrict } from "../../shared/a2ui-strict-validate";
import {
  buildA2uiStandaloneHtml,
  copyA2uiPanelImageToClipboard,
  downloadTextFile,
} from "../utils/a2ui-export";
import { isLikelyIncompleteStreamingA2uiJsonl } from "../../shared/a2ui-jsonl";
import { A2uiJsonlHoverCopyOverlay } from "./A2uiJsonlHoverCopy";

/** Short coalesce while the assistant stream appends characters (shell waits for one HTTP response). */
const A2UI_JSONL_DEBOUNCE_MS = 32;

let catalogReady = false;

function ensureCatalog(): void {
  if (catalogReady) return;
  try {
    initializeDefaultCatalog();
    catalogReady = true;
  } catch {
    /* ignore */
  }
}

function debugLogA2ui(message: string, data?: Record<string, unknown>): void {
  try {
    void (window as unknown as { electronAPI?: { debugLog?: (x: unknown) => void } }).electronAPI?.debugLog?.({
      source: "a2ui-surface",
      message,
      ...data,
    });
  } catch {
    /* ignore */
  }
}

type A2uiSurfaceErrorBoundaryState = { hasError: boolean };

class A2uiSurfaceErrorBoundary extends Component<
  { children: ReactNode; surfaceId: string },
  A2uiSurfaceErrorBoundaryState
> {
  override state: A2uiSurfaceErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): A2uiSurfaceErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    debugLogA2ui("A2uiChatSurface error boundary", {
      surfaceId: this.props.surfaceId,
      error: error.message,
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="a2ui-chat-surface a2ui-chat-surface--error mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg2)] p-3 text-sm text-[var(--text-muted)]">
          Something went wrong rendering this panel. Try a new message or simplify the UI payload.
        </div>
      );
    }
    return this.props.children;
  }
}

export function A2uiChatSurface(props: {
  surfaceId: string;
  jsonl: string;
}): ReactElement {
  const { processMessages, getSurface } = useA2UIActions();
  const [surfaceIssue, setSurfaceIssue] = useState<string | null>(null);
  const [panelHasTree, setPanelHasTree] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const [debouncedJsonl, setDebouncedJsonl] = useState(props.jsonl);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedJsonl(props.jsonl);
    }, A2UI_JSONL_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [props.jsonl]);

  const preparedPipeline = useMemo(() => {
    const t = debouncedJsonl.trim();
    if (!t) return "";
    let pipeline = rewriteA2uiJsonlSurfaceIds(t, props.surfaceId);
    if (A2UI_HOST_LLM_COMPAT) {
      pipeline = coerceLlmShortcutsInA2uiJsonl(pipeline);
      pipeline = repairA2uiLayoutInJsonl(pipeline);
      pipeline = ensureBeginRenderingForJsonl(pipeline, props.surfaceId);
    }
    pipeline = orderA2uiJsonlServerMessages(pipeline);
    return pipeline;
  }, [debouncedJsonl, props.surfaceId]);

  useEffect(() => {
    ensureCatalog();
  }, []);

  useEffect(() => {
    setActionHint(null);
  }, [props.surfaceId]);

  useEffect(() => {
    const onHint = (ev: Event) => {
      const e = ev as CustomEvent<A2uiHostActionHintDetail>;
      const d = e.detail;
      if (!d || d.surfaceId !== props.surfaceId) return;
      setActionHint(d.hint ?? null);
    };
    window.addEventListener(A2UI_HOST_ACTION_HINT_EVENT, onHint);
    return () => window.removeEventListener(A2UI_HOST_ACTION_HINT_EVENT, onHint);
  }, [props.surfaceId]);

  useEffect(() => {
    if (!actionHint) return;
    const id = window.setTimeout(() => setActionHint(null), 12000);
    return () => window.clearTimeout(id);
  }, [actionHint]);

  /**
   * Google shell: `clearSurfaces(); processMessages(response);` — we delete only this surface
   * then apply the full validated message array.
   */
  useEffect(() => {
    const trimmed = preparedPipeline.trim();
    if (!trimmed) {
      setSurfaceIssue(null);
      setPanelHasTree(false);
      setIsUpdating(false);
      try {
        processMessages([
          { deleteSurface: { surfaceId: props.surfaceId } } as ServerToClientMessage,
        ]);
      } catch {
        /* ignore */
      }
      return;
    }

    const tryApply = (jsonl: string, { incremental }: { incremental: boolean }) => {
      const input = incremental && A2UI_HOST_LLM_COMPAT
        ? ensureBeginRenderingForJsonl(jsonl, props.surfaceId)
        : jsonl;
      const strict = validateA2uiJsonlLinesStrict(input);
      if (!strict.ok) return { ok: false as const, error: strict.error };
      const msgs = strict.messages as ServerToClientMessage[];
      const policy = validateHostCatalogPolicy(msgs);
      if (!policy.ok) return { ok: false as const, error: policy.error };
      try {
        /**
         * For incremental (streaming) updates, do not clear the surface:
         * apply the current valid subset so controls appear progressively.
         */
        if (!incremental) {
          processMessages([
            { deleteSurface: { surfaceId: props.surfaceId } } as ServerToClientMessage,
          ]);
        }
        processMessages(msgs);
        return { ok: true as const };
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return { ok: false as const, error: `A2UI processing failed: ${err}` };
      }
    };

    /**
     * Streaming UX:
     * - If the tail is incomplete JSON, try to apply the last fully-parseable prefix so UI builds progressively.
     * - Only show errors for fully-formed but invalid payloads.
     */
    const full = tryApply(trimmed, { incremental: false });
    if (full.ok) {
      setSurfaceIssue(null);
      setIsUpdating(false);
      setPanelHasTree(!!getSurface(props.surfaceId)?.componentTree);
      return;
    }

    if (!isLikelyIncompleteStreamingA2uiJsonl(trimmed)) {
      setSurfaceIssue(full.error);
      setIsUpdating(false);
      setPanelHasTree(!!getSurface(props.surfaceId)?.componentTree);
      return;
    }

    // Apply the last valid prefix (progressive rendering) while the final line is still streaming.
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const prefix: string[] = [];
    for (const l of lines) {
      try {
        JSON.parse(l);
        prefix.push(l);
      } catch {
        break;
      }
    }
    if (prefix.length === 0) {
      setSurfaceIssue(null);
      setIsUpdating(true);
      setPanelHasTree(!!getSurface(props.surfaceId)?.componentTree);
      return;
    }
    const inc = tryApply(prefix.join("\n"), { incremental: true });
    if (!inc.ok) {
      // Still streaming; keep last-rendered UI (if any) and avoid flashing red errors.
      setSurfaceIssue(null);
      setIsUpdating(true);
      setPanelHasTree(!!getSurface(props.surfaceId)?.componentTree);
      return;
    }
    setSurfaceIssue(null);
    setIsUpdating(true);
    setPanelHasTree(!!getSurface(props.surfaceId)?.componentTree);
  }, [preparedPipeline, props.surfaceId, processMessages, getSurface]);

  const showExportToast = (message: string, durationMs = 2400) => {
    try {
      (
        window as unknown as {
          legacyBrowser?: { showToast?: (m: string, n?: number) => void };
        }
      ).legacyBrowser?.showToast?.(message, durationMs);
    } catch {
      /* ignore */
    }
  };

  const onCopyPanelImage = async () => {
    const el = captureRef.current;
    if (!el || exportBusy) return;
    setExportBusy(true);
    try {
      const ok = await copyA2uiPanelImageToClipboard(el);
      showExportToast(
        ok ? "Copied panel as image" : "Could not copy image",
        ok ? 2200 : 4000,
      );
    } catch (e) {
      showExportToast(
        e instanceof Error ? e.message : "Could not copy image",
        4000,
      );
    } finally {
      setExportBusy(false);
    }
  };

  const onDownloadPanelHtml = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const html = await buildA2uiStandaloneHtml({
        surfaceId: props.surfaceId,
        jsonl: preparedPipeline,
      });
      const safe = props.surfaceId.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 48) || "a2ui";
      downloadTextFile(`a2ui-${safe}.html`, html, "text/html;charset=utf-8");
      showExportToast("Downloaded HTML export", 2200);
    } catch (e) {
      showExportToast(
        e instanceof Error ? e.message : "HTML export failed",
        4000,
      );
    } finally {
      setExportBusy(false);
    }
  };

  const onCopyPanelJsonl = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const text = preparedPipeline.trim() || props.jsonl.trim();
      if (!text) {
        showExportToast("No JSONL to copy", 2200);
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showExportToast("Copied JSONL", 2200);
      } catch {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        showExportToast(ok ? "Copied JSONL" : "Could not copy JSONL", ok ? 2200 : 4000);
      }
    } finally {
      setExportBusy(false);
    }
  };

  const jsonlForCopy = preparedPipeline.trim() || props.jsonl.trim();

  return (
    <A2uiSurfaceErrorBoundary surfaceId={props.surfaceId}>
      <div
        className={`a2ui-chat-surface a2ui-chat-surface--panel a2ui-chat-surface__jsonl-wrap${
          surfaceIssue || !panelHasTree ? "" : " a2ui-chat-surface--ready"
        }`}
      >
        <A2uiJsonlHoverCopyOverlay jsonl={jsonlForCopy} />
        {surfaceIssue ? (
          <div className="text-sm text-[var(--text-muted)]">{surfaceIssue}</div>
        ) : !panelHasTree ? (
          <div
            className="a2ui-chat-surface-building"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="a2ui-chat-surface-building__chrome" aria-hidden>
              <span className="a2ui-chat-surface-building__dot" />
              <span className="a2ui-chat-surface-building__dot" />
              <span className="a2ui-chat-surface-building__dot" />
            </div>
            <div className="a2ui-chat-surface-building__skeleton" aria-hidden>
              <span className="a2ui-chat-surface-building__bar a2ui-chat-surface-building__bar--lg" />
              <span className="a2ui-chat-surface-building__bar a2ui-chat-surface-building__bar--md" />
              <span className="a2ui-chat-surface-building__bar a2ui-chat-surface-building__bar--sm" />
            </div>
            <p className="a2ui-chat-surface-building__label">Generating interface…</p>
          </div>
        ) : (
          <>
            <div
              className="a2ui-chat-surface__actions"
              role="toolbar"
              aria-label="Export generated UI"
            >
              <button
                type="button"
                className="a2ui-chat-surface__action-btn"
                disabled={exportBusy}
                onClick={() => void onCopyPanelImage()}
              >
                Copy image
              </button>
              <button
                type="button"
                className="a2ui-chat-surface__action-btn"
                disabled={exportBusy}
                onClick={() => void onCopyPanelJsonl()}
              >
                Copy JSONL
              </button>
              <button
                type="button"
                className="a2ui-chat-surface__action-btn"
                disabled={exportBusy}
                onClick={() => void onDownloadPanelHtml()}
              >
                Download HTML
              </button>
            </div>
            {actionHint ? (
              <p
                className="a2ui-chat-surface__action-hint"
                role="note"
              >
                {actionHint}
              </p>
            ) : null}
            {isUpdating ? (
              <div className="a2ui-chat-surface__updating" aria-live="polite">
                Updating UI…
              </div>
            ) : null}
            <div
              ref={captureRef}
              className="a2ui-chat-surface__capture"
            >
              <A2UIRenderer
                surfaceId={props.surfaceId}
                fallback={
                  <span className="text-sm text-[var(--text-muted)]">
                    Loading UI…
                  </span>
                }
              />
            </div>
          </>
        )}
      </div>
    </A2uiSurfaceErrorBoundary>
  );
}
