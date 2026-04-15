/**
 * Opt-in host-side A2UI patches: synthesize `dataModelUpdate` server messages from
 * `UserAction.context` so `MessageProcessor.processMessages` can run without a model round-trip.
 */

import { A2uiMessageSchema } from "@a2ui-internal/v0_8/server-to-client-schema";
import type { A2uiUserActionPayload } from "./format-a2ui-user-action";

/** Namespaced action that always participates in local patch parsing (still needs valid context). */
export const A2UI_HOST_PATCH_V1 = "host.patch.v1";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

type ContextKv = { key: string; value: unknown };

function isContextKv(x: unknown): x is ContextKv {
  if (!isRecord(x)) return false;
  return typeof x.key === "string" && "value" in x;
}

function readPrimitiveFromA2uiValue(v: unknown): string | number | boolean | null {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (!isRecord(v)) return null;
  if (typeof v.literalString === "string") return v.literalString;
  if (typeof v.literalNumber === "number") return v.literalNumber;
  if (typeof v.literalBoolean === "boolean") return v.literalBoolean;
  return null;
}

/**
 * Normalizes `UserAction.context` into a plain record.
 * - Some payloads arrive as an object (`{ patchKind, path, ... }`)
 * - v0.8 authoring uses `action.context: [{key,value},...]` which renderers may forward directly
 */
function normalizeContextToRecord(ctx: unknown): Record<string, unknown> | null {
  if (isRecord(ctx)) return ctx;
  if (!Array.isArray(ctx)) return null;
  const out: Record<string, unknown> = {};
  for (const item of ctx) {
    if (!isContextKv(item)) return null;
    const k = item.key.trim();
    if (!k) return null;
    const pv = readPrimitiveFromA2uiValue(item.value);
    out[k] = pv ?? item.value;
  }
  return out;
}

/** True when the model/user opted into host-side `processMessages` for this action. */
export function isA2uiLocalPatchOptIn(ua: A2uiUserActionPayload): boolean {
  if (ua.name === A2UI_HOST_PATCH_V1) return true;
  const c = normalizeContextToRecord(ua.context);
  if (!c) return false;
  return c.a2uiLocalPatch === true;
}

type ValueMapLike = {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: ValueMapLike[];
};

function isValueMapLike(x: unknown): x is ValueMapLike {
  if (!isRecord(x)) return false;
  if (typeof x.key !== "string" || x.key.length === 0) return false;
  const has =
    "valueString" in x ||
    "valueNumber" in x ||
    "valueBoolean" in x ||
    "valueMap" in x;
  if (!has) return false;
  if (x.valueMap !== undefined) {
    if (!Array.isArray(x.valueMap)) return false;
    for (const v of x.valueMap) {
      if (!isValueMapLike(v)) return false;
    }
  }
  return true;
}

function parseContents(raw: unknown): ValueMapLike[] | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: ValueMapLike[] = [];
  for (const row of value) {
    if (!isValueMapLike(row)) return null;
    out.push(row);
  }
  return out;
}

export type LocalPatchBuildResult =
  | { ok: true; messages: ReturnType<typeof A2uiMessageSchema.parse>[] }
  | { ok: false; reason: string };

/**
 * When the model opts in (`context.a2uiLocalPatch === true` or `name === host.patch.v1`),
 * builds a single validated `dataModelUpdate` message for `processMessages`.
 */
export function tryBuildLocalPatchMessages(
  ua: A2uiUserActionPayload,
): LocalPatchBuildResult {
  if (!isA2uiLocalPatchOptIn(ua)) {
    return { ok: false, reason: "not_opt_in" };
  }
  const ctx = normalizeContextToRecord(ua.context);
  if (!ctx) {
    return { ok: false, reason: "missing_context" };
  }
  if (ctx.patchKind !== "dataModelUpdate") {
    return { ok: false, reason: "patchKind_not_dataModelUpdate" };
  }
  const pathRaw = ctx.path;
  const path =
    typeof pathRaw === "string" ? pathRaw : pathRaw === undefined ? "/" : null;
  if (path === null) {
    return { ok: false, reason: "invalid_path" };
  }
  const contents = parseContents(ctx.contents);
  if (!contents) {
    return { ok: false, reason: "invalid_contents" };
  }

  const rawMsg = {
    dataModelUpdate: {
      surfaceId: ua.surfaceId,
      path,
      contents,
    },
  };

  try {
    const parsed = A2uiMessageSchema.parse(rawMsg);
    return { ok: true, messages: [parsed] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `schema: ${msg}` };
  }
}
