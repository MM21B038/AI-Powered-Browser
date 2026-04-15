/**
 * Strict validation helpers for A2UI v0.9 messages.
 *
 * Uses the canonical Zod schemas exported from `@a2ui/web_core/v0_9`.
 */

import {
  A2uiMessageSchema,
} from "@a2ui/web_core/v0_9";

export type A2uiV09ValidationResult =
  | { ok: true; messages: unknown[] }
  | { ok: false; error: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Parse + validate NDJSON lines (each line must be a single v0.9 message).
 * Returns all messages if every line is valid.
 */
export function validateA2uiV09JsonlLinesStrict(jsonl: string): A2uiV09ValidationResult {
  const t = jsonl.trim();
  if (!t) return { ok: false, error: "No messages found" };

  const msgs: unknown[] = [];
  const lines = t.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (e) {
      const detail = e instanceof SyntaxError ? e.message : String(e);
      return { ok: false, error: `Invalid JSON on line ${i + 1}: ${detail}` };
    }
    if (!isRecord(parsed)) {
      return { ok: false, error: `Line ${i + 1} must be a JSON object` };
    }
    try {
      A2uiMessageSchema.parse(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Line ${i + 1} failed schema validation: ${msg}` };
    }
    msgs.push(parsed);
  }
  return { ok: true, messages: msgs };
}

/**
 * Streaming helper: returns true when the last non-empty line is not yet valid JSON.
 * Use to avoid flashing errors mid-stream.
 */
export function isLikelyIncompleteStreamingA2uiV09Jsonl(jsonl: string): boolean {
  const t = jsonl.trim();
  if (!t) return false;
  const lines = t
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length === 0) return false;
  const last = lines[lines.length - 1]!;
  try {
    JSON.parse(last);
    return false;
  } catch {
    return true;
  }
}

