import { useEffect, useMemo, useState, type ReactElement } from "react";
import { A2uiSurface } from "@a2ui/react/v0_9";
import {
  isLikelyIncompleteStreamingA2uiV09Jsonl,
  validateA2uiV09JsonlLinesStrict,
} from "../../../../shared/a2ui-v0_9-validate";
import { repairA2uiV09JsonlForHost } from "../../../../shared/a2ui-v0_9-repair";
import { getA2uiV09Runtime } from "../../../services/a2ui-v0_9-runtime";
import { ensureCompoundInterestHook, ensureKanbanHook, ensureTodoStatsHook } from "../../../services/a2ui-v0_9-runtime";
import {
  A2UI_V09_BASIC_CATALOG_JSON_URL,
  A2UI_V09_VERSION,
} from "../../../../shared/a2ui-v0_9-constants";

export function A2uiV09ChatSurface(props: {
  surfaceId: string;
  jsonl: string;
}): ReactElement {
  const runtime = useMemo(() => getA2uiV09Runtime(), []);
  const [issue, setIssue] = useState<string | null>(null);
  const [hasSurface, setHasSurface] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    const t0 = props.jsonl.trim();
    const repairedMaybe = repairA2uiV09JsonlForHost(t0, { surfaceId: props.surfaceId });
    const repaired = repairedMaybe ?? t0;
    setIsFixing(repairedMaybe != null);
    const t = repaired.trim();
    if (!t) {
      setIssue(null);
      setHasSurface(false);
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
      const withCreate = !surfaceExists && needsCreate
        ? ([
            {
              version: A2UI_V09_VERSION,
              createSurface: {
                surfaceId: props.surfaceId,
                catalogId: A2UI_V09_BASIC_CATALOG_JSON_URL,
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
      setIssue(full.error);
      setHasSurface(false);
      setIsUpdating(false);
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

  if (issue) {
    return (
      <div className="a2ui-chat-surface a2ui-chat-surface--error mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg2)] p-3 text-sm text-[var(--text-muted)]">
        {issue}
      </div>
    );
  }
  if (!hasSurface || !surface) {
    return (
      <div className="a2ui-chat-surface a2ui-chat-surface--panel">
        <div className="a2ui-chat-surface-building" role="status" aria-live="polite">
          <p className="a2ui-chat-surface-building__label">Generating interface…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="a2ui-chat-surface a2ui-chat-surface--panel a2ui-chat-surface--ready">
      {isFixing ? (
        <div className="a2ui-chat-surface__updating" aria-live="polite">
          Fixing UI…
        </div>
      ) : isUpdating ? (
        <div className="a2ui-chat-surface__updating" aria-live="polite">
          Updating UI…
        </div>
      ) : null}
      <A2uiSurface surface={surface as any} />
    </div>
  );
}

