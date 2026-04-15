/**
 * Strict v0.8 validation using the same Zod schemas as `@a2ui/web_core` / `processMessages`.
 */

import { A2uiMessageSchema } from "@a2ui-internal/v0_8/server-to-client-schema";

export type A2uiValidatedMessage = ReturnType<typeof A2uiMessageSchema.parse>;

function formatParseError(lineNo: number, err: unknown): string {
  if (err && typeof err === "object" && "issues" in err) {
    return `A2UI line ${lineNo}: ${JSON.stringify((err as { issues: unknown }).issues)}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return `A2UI line ${lineNo}: ${msg}`;
}

/**
 * Parses each non-empty JSONL line and validates with `A2uiMessageSchema` (strict v0.8).
 */
export function validateA2uiJsonlLinesStrict(
  jsonl: string,
):
  | { ok: true; messages: A2uiValidatedMessage[] }
  | { ok: false; error: string } {
  const lines = jsonl.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const messages: A2uiValidatedMessage[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    try {
      const raw: unknown = JSON.parse(lines[i]!);
      messages.push(A2uiMessageSchema.parse(raw));
    } catch (e) {
      return { ok: false, error: formatParseError(lineNo, e) };
    }
  }
  return { ok: true, messages };
}

/**
 * Validates NDJSON **line-by-line** and returns the longest **valid prefix** of messages.
 * - **Incomplete tail:** last line is not yet valid JSON (streaming) — `incompleteTail` is true; `messages` are all complete lines before it.
 * - **Hard error:** JSON parse fails on a non-last line, or schema fails on any line — `hardError` is set; `messages` are the valid prefix **before** the bad line (may be empty).
 */
export function validateA2uiJsonlStrictPrefix(jsonl: string): {
  messages: A2uiValidatedMessage[];
  incompleteTail: boolean;
  hardError: string | null;
} {
  const lines = jsonl.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const messages: A2uiValidatedMessage[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let raw: unknown;
    try {
      raw = JSON.parse(lines[i]!);
    } catch (e) {
      if (i === lines.length - 1) {
        return { messages, incompleteTail: true, hardError: null };
      }
      return {
        messages,
        incompleteTail: false,
        hardError: formatParseError(lineNo, e),
      };
    }
    try {
      messages.push(A2uiMessageSchema.parse(raw));
    } catch (e) {
      return {
        messages,
        incompleteTail: false,
        hardError: formatParseError(lineNo, e),
      };
    }
  }
  return { messages, incompleteTail: false, hardError: null };
}
