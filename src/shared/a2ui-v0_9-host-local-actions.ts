import type { A2uiClientAction } from "@a2ui/web_core/v0_9/schema/client-to-server.js";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function readUrlFromContext(ctx: unknown): string | null {
  if (!isRecord(ctx)) return null;
  const u = ctx.url;
  return typeof u === "string" && u.trim().length > 0 ? u.trim() : null;
}

const OPEN_URL_NAMES = new Set(["host.openUrl", "a2ui.host.openUrl"]);

type OpenExternalFn = (url: string) => Promise<{ success?: boolean; error?: string }>;

export type A2uiV09HostLocalActionResult =
  | { handled: true; kind: "openUrl"; success: true }
  | { handled: true; kind: "openUrl"; success: false; message: string }
  | { handled: false };

export async function handleA2uiV09HostLocalAction(
  action: A2uiClientAction,
): Promise<A2uiV09HostLocalActionResult> {
  if (!OPEN_URL_NAMES.has(action.name)) return { handled: false };
  const url = readUrlFromContext(action.context);
  if (!url) {
    return { handled: true, kind: "openUrl", success: false, message: "Missing url in context" };
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return { handled: true, kind: "openUrl", success: false, message: "URL must use http or https" };
    }
  } catch {
    return { handled: true, kind: "openUrl", success: false, message: "Invalid URL" };
  }

  const w = globalThis as unknown as { electronAPI?: { openExternal?: OpenExternalFn } };
  const open = w.electronAPI?.openExternal;
  if (open) {
    const r = await open(url);
    if (r?.success) return { handled: true, kind: "openUrl", success: true };
    return { handled: true, kind: "openUrl", success: false, message: r?.error ?? "openExternal failed" };
  }
  return { handled: true, kind: "openUrl", success: false, message: "openExternal unavailable" };
}

