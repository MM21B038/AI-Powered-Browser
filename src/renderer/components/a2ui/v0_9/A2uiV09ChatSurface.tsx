import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";
import { A2uiSurface } from "@a2ui/react/v0_9";
import {
  isLikelyIncompleteStreamingA2uiV09Jsonl,
  validateA2uiV09JsonlLinesStrict,
} from "../../../../shared/a2ui-v0_9-validate";
import { repairA2uiV09JsonlForHost } from "../../../../shared/a2ui-v0_9-repair";
import { getA2uiV09Runtime } from "../../../services/a2ui-v0_9-runtime";
import { ensureCompoundInterestHook, ensureKanbanHook, ensureTodoStatsHook } from "../../../services/a2ui-v0_9-runtime";
import {
  A2UI_V09_HOST_CATALOG_JSON_URL,
  A2UI_V09_VERSION,
} from "../../../../shared/a2ui-v0_9-constants";
import { A2uiJsonlHoverCopyOverlay } from "../../A2uiJsonlHoverCopy";

type A2uiV09SurfaceErrorBoundaryState = { hasError: boolean };

class A2uiV09SurfaceErrorBoundary extends Component<
  { children: ReactNode; surfaceId: string },
  A2uiV09SurfaceErrorBoundaryState
> {
  override state: A2uiV09SurfaceErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): A2uiV09SurfaceErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      void window.electronAPI?.debugLog?.({
        source: "a2ui-v0_9-chat-surface",
        message: "A2uiSurface render error",
        data: {
          surfaceId: this.props.surfaceId,
          error: error.message,
          componentStack: info.componentStack?.slice(0, 500),
        },
      });
    } catch {
      /* ignore */
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="a2ui-chat-surface a2ui-chat-surface--error mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg2)] p-3 text-sm text-[var(--text-muted)] a2ui-chat-surface__jsonl-wrap">
          Something went wrong rendering this panel. Try a new message or simplify the UI payload.
        </div>
      );
    }
    return this.props.children;
  }
}

export function A2uiV09ChatSurface(props: {
  surfaceId: string;
  jsonl: string;
  overlayStatusText?: string;
  preserveSurfaceId?: boolean;
}): ReactElement {
  const runtime = useMemo(() => getA2uiV09Runtime(), []);
  const [issue, setIssue] = useState<string | null>(null);
  const [hasSurface, setHasSurface] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  const overlayStatus =
    props.overlayStatusText?.trim() ||
    (isFixing ? "Fixing UI…" : isUpdating ? "Updating UI…" : "");

  useEffect(() => {
    // Some A2UI controls (dropdown/popover) render in portals that can float above the panel.
    // When the overlay is visible, mark the document so CSS can force those portals behind
    // the overlay and disable interaction until the UI is ready.
    const active = overlayStatus.trim().length > 0;
    try {
      if (active) document.body.dataset.a2uiOverlayActive = "1";
      else delete (document.body.dataset as any).a2uiOverlayActive;
    } catch {
      /* ignore */
    }
    return () => {
      try {
        if (document.body.dataset.a2uiOverlayActive === "1") {
          delete (document.body.dataset as any).a2uiOverlayActive;
        }
      } catch {
        /* ignore */
      }
    };
  }, [overlayStatus]);

  useEffect(() => {
    const t0 = props.jsonl.trim();
    const repairedMaybe = repairA2uiV09JsonlForHost(t0, { surfaceId: props.surfaceId });
    const repaired = repairedMaybe ?? t0;
    setIsFixing(repairedMaybe != null);
    const t = repaired.trim();
    if (!t) {
      setIssue(null);
      setHasSurface(!!runtime.getSurface(props.surfaceId));
      setIsUpdating(false);
      setIsFixing(false);
      return;
    }
    const apply = (jsonl: string): { ok: true } | { ok: false; error: string } => {
      const v = validateA2uiV09JsonlLinesStrict(jsonl);
      if (!v.ok) return { ok: false, error: v.error };
      const surfaceExists = !!runtime.getSurface(props.surfaceId);
      const msgs = (v.messages as unknown[])
        .map((m) => {
        const msg = m as any;
        if (props.preserveSurfaceId) {
          // Preserve model-emitted surface ids, but never re-create a surface that already exists.
          const sid = msg?.createSurface?.surfaceId;
          if (typeof sid === "string" && sid.trim() && runtime.getSurface(sid.trim())) {
            return null;
          }
          return msg;
        }
        if (msg?.createSurface?.surfaceId) {
          if (surfaceExists) return null;
          return {
            ...msg,
            createSurface: { ...msg.createSurface, surfaceId: props.surfaceId },
          };
        }
        if (msg?.updateComponents?.surfaceId) {
          return {
            ...msg,
            updateComponents: { ...msg.updateComponents, surfaceId: props.surfaceId },
          };
        }
        if (msg?.updateDataModel?.surfaceId) {
          return {
            ...msg,
            updateDataModel: { ...msg.updateDataModel, surfaceId: props.surfaceId },
          };
        }
        if (msg?.deleteSurface?.surfaceId) {
          return {
            ...msg,
            deleteSurface: { ...msg.deleteSurface, surfaceId: props.surfaceId },
          };
        }
        return msg;
      })
        .filter((x) => x != null);
      const needsCreate = !msgs.some(
        (m) => (m as any)?.createSurface?.surfaceId === props.surfaceId,
      );
      const withCreate = !props.preserveSurfaceId && !surfaceExists && needsCreate
        ? ([
            {
              version: A2UI_V09_VERSION,
              createSurface: {
                surfaceId: props.surfaceId,
                catalogId: A2UI_V09_HOST_CATALOG_JSON_URL,
              },
            },
            ...msgs,
          ] as unknown[])
        : msgs;
      try {
        runtime.processMessages(withCreate);
        const surface = runtime.getSurface(props.surfaceId) as any;
        ensureTodoStatsHook(surface);
        ensureCompoundInterestHook(surface);
        ensureKanbanHook(surface);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `A2UI v0.9 processing failed: ${msg}` };
      }
    };

    const full = apply(t);
    if (full.ok) {
      setIssue(null);
      setHasSurface(true);
      setIsUpdating(false);
      setIsFixing(false);
      return;
    }

    if (!isLikelyIncompleteStreamingA2uiV09Jsonl(t)) {
      // Keep showing the last good surface (if any) while a new payload is invalid.
      const surfaceExists = !!runtime.getSurface(props.surfaceId);
      setIssue(full.error);
      setHasSurface(surfaceExists);
      setIsUpdating(surfaceExists);
      // keep isFixing flag so users know we attempted recovery
      return;
    }

    // Streaming: apply the last fully-parseable prefix.
    const lines = t
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
      setIssue(null);
      setHasSurface(!!runtime.getSurface(props.surfaceId));
      setIsUpdating(true);
      // streaming; keep isFixing state
      return;
    }
    const inc = apply(prefix.join("\n"));
    if (inc.ok) {
      setIssue(null);
      setHasSurface(true);
      setIsUpdating(true);
      return;
    }
    setIssue(null);
    setHasSurface(!!runtime.getSurface(props.surfaceId));
    setIsUpdating(true);
  }, [props.jsonl, props.surfaceId, runtime]);

  const surface = runtime.getSurface(props.surfaceId) as unknown;
  const surfaceExists = !!surface;

  if (issue) {
    // If we still have a surface, show it with an overlay instead of dropping the UI.
    if ((hasSurface || surfaceExists) && surface) {
      const status = props.overlayStatusText?.trim() || "Fixing UI…";
      return (
        <div className="a2ui-chat-surface a2ui-chat-surface--panel a2ui-chat-surface--ready a2ui-chat-surface__jsonl-wrap relative">
          <A2uiJsonlHoverCopyOverlay jsonl={props.jsonl} />
          <A2uiV09SurfaceErrorBoundary surfaceId={props.surfaceId}>
            <A2uiSurface surface={surface as any} />
          </A2uiV09SurfaceErrorBoundary>
          <div
            className="a2ui-chat-surface__overlay"
            role="status"
            aria-live="polite"
            aria-label={status}
          >
            <div className="a2ui-chat-surface__overlay-inner">
              <div className="a2ui-chat-surface__overlay-spinner" aria-hidden />
              <div className="a2ui-chat-surface__overlay-text">
                <div className="a2ui-chat-surface__overlay-title">{status}</div>
                <div className="a2ui-chat-surface__overlay-subtitle">
                  {String(issue).slice(0, 140)}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="a2ui-chat-surface a2ui-chat-surface--error mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg2)] p-3 text-sm text-[var(--text-muted)] a2ui-chat-surface__jsonl-wrap">
        <A2uiJsonlHoverCopyOverlay jsonl={props.jsonl} />
        {issue}
      </div>
    );
  }

  // Prefer rendering an existing runtime surface (progressive UX) even if state hasn't caught up yet.
  if (!surfaceExists || !surface) {
    return (
      <div className="a2ui-chat-surface a2ui-chat-surface--panel a2ui-chat-surface__jsonl-wrap">
        <A2uiJsonlHoverCopyOverlay jsonl={props.jsonl} />
        <div className="a2ui-chat-surface-building" role="status" aria-live="polite">
          <p className="a2ui-chat-surface-building__label">Generating interface…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="a2ui-chat-surface a2ui-chat-surface--panel a2ui-chat-surface--ready a2ui-chat-surface__jsonl-wrap relative">
      <A2uiJsonlHoverCopyOverlay jsonl={props.jsonl} />
      <A2uiV09SurfaceErrorBoundary surfaceId={props.surfaceId}>
        <A2uiSurface surface={surface as any} />
      </A2uiV09SurfaceErrorBoundary>
      {overlayStatus ? (
        <div
          className="a2ui-chat-surface__overlay"
          role="status"
          aria-live="polite"
          aria-label={overlayStatus}
        >
          <div className="a2ui-chat-surface__overlay-inner">
            <div className="a2ui-chat-surface__overlay-spinner" aria-hidden />
            <div className="a2ui-chat-surface__overlay-text">
              <div className="a2ui-chat-surface__overlay-title">{overlayStatus}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

