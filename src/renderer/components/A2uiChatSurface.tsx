/**
 * Renders one A2UI JSONL blob inside the chat (requires ancestor {@link A2UIProvider}).
 */

import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";
import { A2UIRenderer, useA2UIActions } from "@a2ui/react";
import type { ServerToClientMessage } from "@a2ui/react";
import { initializeDefaultCatalog } from "@a2ui/react";
import {
  A2UI_HOST_LLM_COMPAT,
  coerceLlmShortcutsInA2uiJsonl,
  ensureBeginRenderingForJsonl,
  orderA2uiJsonlServerMessages,
  repairA2uiLayoutInJsonl,
  rewriteA2uiJsonlSurfaceIds,
} from "../../shared/a2ui-jsonl";
import { validateA2uiJsonlLinesStrict } from "../../shared/a2ui-strict-validate";

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

  useEffect(() => {
    ensureCatalog();
  }, []);

  useEffect(() => {
    let pipeline = rewriteA2uiJsonlSurfaceIds(props.jsonl, props.surfaceId);
    if (A2UI_HOST_LLM_COMPAT) {
      pipeline = coerceLlmShortcutsInA2uiJsonl(pipeline);
      pipeline = repairA2uiLayoutInJsonl(pipeline);
    }
    pipeline = orderA2uiJsonlServerMessages(pipeline);
    if (A2UI_HOST_LLM_COMPAT) {
      pipeline = ensureBeginRenderingForJsonl(pipeline, props.surfaceId);
    }
    const trimmed = pipeline.trim();
    if (!trimmed) {
      setSurfaceIssue(null);
      return;
    }
    const strict = validateA2uiJsonlLinesStrict(trimmed);
    if (!strict.ok) {
      setSurfaceIssue(strict.error);
      return;
    }
    const msgs = strict.messages as ServerToClientMessage[];
    try {
      processMessages(msgs);
      const surf = getSurface(props.surfaceId);
      if (!surf?.componentTree) {
        setSurfaceIssue(
          "The A2UI payload did not produce a renderable surface. Check beginRendering.root matches a component id, v0.8 shapes, and schema (see system prompt).",
        );
        debugLogA2ui("no componentTree after processMessages", {
          surfaceId: props.surfaceId,
          preview: trimmed.slice(0, 500),
        });
      } else {
        setSurfaceIssue(null);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setSurfaceIssue(`A2UI processing failed: ${err}`);
      debugLogA2ui("processMessages failed", {
        surfaceId: props.surfaceId,
        error: err,
        preview: trimmed.slice(0, 400),
      });
    }
  }, [props.surfaceId, props.jsonl, processMessages, getSurface]);

  return (
    <A2uiSurfaceErrorBoundary surfaceId={props.surfaceId}>
      <div className="a2ui-chat-surface mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg2)] p-2">
        {surfaceIssue ? (
          <div className="text-sm text-[var(--text-muted)]">{surfaceIssue}</div>
        ) : (
          <A2UIRenderer
            surfaceId={props.surfaceId}
            fallback={
              <span className="text-sm text-[var(--text-muted)]">
                Loading UI…
              </span>
            }
          />
        )}
      </div>
    </A2uiSurfaceErrorBoundary>
  );
}
