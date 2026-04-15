/**
 * Host-reserved A2UI action names for client-side behavior without an LLM round-trip.
 *
 * The bundled `@a2ui/react/v0_8` renderer only emits `userAction` messages (no separate
 * `functionCall` wire shape). These names mirror the v0.9 catalog “local function” idea
 * using stable `Button.action.name` strings plus resolved `context`.
 */

import type { A2uiUserActionPayload } from "./format-a2ui-user-action";

/** Dispatched on `window` after each A2UI user action so panels can show inline hints. */
export const A2UI_HOST_ACTION_HINT_EVENT = "a2ui-host-action-hint" as const;

export type A2uiHostActionHintDetail = {
  surfaceId: string;
  hint: string | null;
};

/**
 * Shown when A2UI follow-up is **off** — the click is acknowledged but nothing is sent to the model.
 * Prefer Settings → A2UI button actions → **Send as next message** (default) or **Append to composer**.
 */
export const A2UI_HOST_ACTION_FOLLOW_UP_OFF_HINT =
  "This click is not forwarded to the assistant. In Settings → A2UI button actions, choose “Send as next message” or “Append to composer”.";

/** When follow-up is append: remind the user to send. */
export const A2UI_HOST_ACTION_APPEND_HINT =
  "Action added to your message — press Send so the assistant can respond.";

const OPEN_URL_NAMES = new Set(["host.openUrl", "a2ui.host.openUrl"]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function readUrlFromContext(ctx: unknown): string | null {
  if (!isRecord(ctx)) return null;
  const u = ctx.url;
  return typeof u === "string" && u.trim().length > 0 ? u.trim() : null;
}

type OpenExternalFn = (
  url: string,
) => Promise<{ success?: boolean; error?: string }>;

export type A2uiHostLocalActionResult =
  | { handled: true; kind: "openUrl"; success: true }
  | { handled: true; kind: "openUrl"; success: false; message: string }
  | { handled: false };

export function isA2uiHostReservedActionName(name: string): boolean {
  return OPEN_URL_NAMES.has(name);
}

/**
 * Runs allowlisted host behavior for reserved `UserAction.name` values (e.g. open a URL in the system browser).
 * Returns `handled: false` for normal agent-driven action names.
 */
export async function handleA2uiHostLocalAction(
  ua: A2uiUserActionPayload,
): Promise<A2uiHostLocalActionResult> {
  if (!OPEN_URL_NAMES.has(ua.name)) {
    return { handled: false };
  }
  const url = readUrlFromContext(ua.context);
  if (!url) {
    return {
      handled: true,
      kind: "openUrl",
      success: false,
      message: "Missing url in action context",
    };
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return {
        handled: true,
        kind: "openUrl",
        success: false,
        message: "URL must use http or https",
      };
    }
  } catch {
    return {
      handled: true,
      kind: "openUrl",
      success: false,
      message: "Invalid URL",
    };
  }

  const w = globalThis as unknown as {
    electronAPI?: { openExternal?: OpenExternalFn };
  };
  const open = w.electronAPI?.openExternal;
  if (open) {
    const r = await open(url);
    if (r?.success) {
      return { handled: true, kind: "openUrl", success: true };
    }
    return {
      handled: true,
      kind: "openUrl",
      success: false,
      message: r?.error ?? "openExternal failed",
    };
  }

  try {
    const win = globalThis as unknown as {
      open?: (url: string, target?: string, features?: string) => unknown;
    };
    if (typeof win.open === "function") {
      win.open(url, "_blank", "noopener,noreferrer");
      return { handled: true, kind: "openUrl", success: true };
    }
  } catch {
    /* ignore */
  }
  return {
    handled: true,
    kind: "openUrl",
    success: false,
    message: "openExternal unavailable",
  };
}

export function emitA2uiHostActionHint(detail: A2uiHostActionHintDetail): void {
  const g = globalThis as unknown as {
    dispatchEvent?: (e: Event) => boolean;
  };
  g.dispatchEvent?.(
    new CustomEvent(A2UI_HOST_ACTION_HINT_EVENT, { detail }),
  );
}
