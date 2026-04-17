/** Mirrors upstream `UserAction` (`@a2ui/web_core` client event). */
export type A2uiUserActionPayload = {
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  timestamp: string;
  context?: { [k: string]: unknown };
};

/** How the host reacts when the user triggers an A2UI `Button.action` (etc.). */
export type A2uiActionFollowUp = "off" | "append" | "send";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function isUserActionLoose(x: unknown): x is A2uiUserActionPayload {
  if (!isRecord(x)) return false;
  return (
    typeof x.name === "string" &&
    typeof x.surfaceId === "string" &&
    typeof x.sourceComponentId === "string" &&
    typeof x.timestamp === "string"
  );
}

/** Narrow an `onAction` payload to a `UserAction` when present and well-formed. */
export function extractUserActionFromClientMessage(
  msg: unknown,
): A2uiUserActionPayload | undefined {
  if (!isRecord(msg)) return undefined;
  const ua = msg.userAction;
  if (ua === undefined) return undefined;
  return isUserActionLoose(ua) ? ua : undefined;
}

/** Stable, model-friendly line for chat / logs (matches plan: name, surface, source, optional context JSON). */
export function formatA2uiUserActionMessageLine(ua: A2uiUserActionPayload): string {
  const base = `[A2UI action] name=${ua.name} surface=${ua.surfaceId} source=${ua.sourceComponentId}`;
  const ctx = ua.context;
  if (ctx && Object.keys(ctx).length > 0) {
    return `${base} context=${JSON.stringify(ctx)}`;
  }
  return base;
}

export type A2uiActionFollowUpPlan = {
  appendComposer: boolean;
  autoSend: boolean;
  /** When true, show the busy + composer message instead of the short acknowledgement toast. */
  useBusyComposerToast: boolean;
};

/**
 * Maps follow-up mode + pipeline busy state to UI behavior.
 * When mode is `send` and the scope is busy, we do not auto-send; we append to the composer and toast.
 */
export function planA2uiActionFollowUp(
  mode: A2uiActionFollowUp,
  scopeBusy: boolean,
): A2uiActionFollowUpPlan {
  if (mode === "off") {
    return { appendComposer: false, autoSend: false, useBusyComposerToast: false };
  }
  if (mode === "append") {
    return { appendComposer: true, autoSend: false, useBusyComposerToast: false };
  }
  if (scopeBusy) {
    return { appendComposer: true, autoSend: false, useBusyComposerToast: true };
  }
  return { appendComposer: false, autoSend: true, useBusyComposerToast: false };
}
