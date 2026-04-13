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
