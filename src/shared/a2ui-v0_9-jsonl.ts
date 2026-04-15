/**
 * Detect and extract A2UI v0.9 JSONL messages from assistant text.
 *
 * v0.9 message keys (per https://a2ui.org/reference/messages/):
 * - { version:"v0.9", createSurface: {...} }
 * - { version:"v0.9", updateComponents: {...} }
 * - { version:"v0.9", updateDataModel: {...} }
 * - { version:"v0.9", deleteSurface: {...} }
 */

import { A2UI_V09_VERSION } from "./a2ui-v0_9-constants";

export type A2uiV09PartitionedAssistant = {
  markdown: string;
  /** Joined JSONL lines for v0.9 message processing, or undefined if none. */
  a2uiV09Jsonl?: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

export function isA2uiV09ServerMessage(obj: Record<string, unknown>): boolean {
  if (obj.version !== A2UI_V09_VERSION) return false;
  return Boolean(
    obj.createSurface ||
      obj.updateComponents ||
      obj.updateDataModel ||
      obj.deleteSurface,
  );
}

/** GitHub-style fenced code blocks; group 2 is inner body (no trailing fence line). */
const FENCE_RE = /```([a-zA-Z0-9_-]*)\s*\r?\n([\s\S]*?)\r?\n```/g;

function findTrailingOpenJsonOrJsonlFence(
  full: string,
): { markdownPrefix: string; inner: string } | null {
  const openRe = /(?:^|\n)(```\s*(?:jsonl|json)\s*\r?\n)/g;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(full)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) return null;
  const innerStart = lastMatch.index + lastMatch[0].length;
  const inner = full.slice(innerStart);
  if (/(?:^|\r?\n)\s*```\s*(?:\r?\n|$)/.test(inner)) return null;
  const fenceLineStart = lastMatch.index + (lastMatch[0].startsWith("\n") ? 1 : 0);
  const markdownPrefix = full.slice(0, fenceLineStart);
  return { markdownPrefix, inner };
}

function tryPushV09Object(obj: unknown, out: string[]): boolean {
  if (!isRecord(obj)) return false;
  if (!isA2uiV09ServerMessage(obj)) return false;
  out.push(JSON.stringify(obj));
  return true;
}

/**
 * Some models (and humans) paste multiple JSON objects on one line, e.g.:
 * `{"version":"v0.9",...} {"version":"v0.9",...}`
 *
 * This extracts each complete top-level JSON object using a lightweight scanner
 * that respects strings + escaping.
 */
function extractJsonObjectsFromLine(line: string): string[] {
  const t = line;
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\\\") {
        esc = true;
        continue;
      }
      if (ch === "\"") {
        inStr = false;
      }
      continue;
    }
    if (ch === "\"") {
      inStr = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(t.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

function extractV09FromFenceInner(inner: string, out: string[]): void {
  const t = inner.trim();
  if (!t) return;
  try {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j)) {
      for (const item of j) tryPushV09Object(item, out);
      return;
    }
    if (tryPushV09Object(j, out)) return;
  } catch {
    /* fall through */
  }
  for (const line of inner.split(/\r?\n/)) {
    const lt = line.trim();
    if (!lt) continue;
    const multi = extractJsonObjectsFromLine(lt);
    if (multi.length > 1) {
      for (const objText of multi) {
        try {
          const j = JSON.parse(objText) as unknown;
          tryPushV09Object(j, out);
        } catch {
          /* skip */
        }
      }
      continue;
    }
    try {
      const j = JSON.parse(lt) as unknown;
      tryPushV09Object(j, out);
    } catch {
      /* skip */
    }
  }
}

function partitionLineBlock(block: string, out: string[]): string {
  const otherLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) {
      otherLines.push(line);
      continue;
    }
    const multi = extractJsonObjectsFromLine(line);
    if (multi.length >= 1) {
      let pushed = 0;
      for (const objText of multi) {
        try {
          const j = JSON.parse(objText) as unknown;
          if (tryPushV09Object(j, out)) pushed++;
        } catch {
          /* ignore */
        }
      }
      if (pushed > 0) continue;
    }
    try {
      const j = JSON.parse(t) as unknown;
      if (tryPushV09Object(j, out)) continue;
    } catch {
      // Hide streamed partial JSON tokens that look like v0.9 messages.
      if (
        t.startsWith("{") &&
        /"version"\s*:\s*"v0\.9"/.test(t) &&
        /"(createSurface|updateComponents|updateDataModel|deleteSurface)"\s*:/.test(t)
      ) {
        continue;
      }
    }
    otherLines.push(line);
  }
  return otherLines.join("\n");
}

/** Split streamed assistant text into markdown vs A2UI v0.9 JSONL lines. */
export function partitionAssistantTextForA2uiV09(full: string): A2uiV09PartitionedAssistant {
  const trimmed = full.trim();
  if (!trimmed) return { markdown: "" };

  const a2uiOrdered: string[] = [];
  const open = findTrailingOpenJsonOrJsonlFence(full);
  const core = open?.markdownPrefix ?? full;
  if (open) {
    extractV09FromFenceInner(open.inner, a2uiOrdered);
  }

  const mdParts: string[] = [];
  let last = 0;
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(core)) !== null) {
    const before = core.slice(last, m.index);
    mdParts.push(partitionLineBlock(before, a2uiOrdered));
    const beforeCount = a2uiOrdered.length;
    extractV09FromFenceInner(m[2] ?? "", a2uiOrdered);
    // If fence produced no v0.9 messages, keep it in markdown.
    if (a2uiOrdered.length === beforeCount) {
      const idx = mdParts.length - 1;
      const fenceText = m[0] ?? "";
      const prev = mdParts[idx] ?? "";
      mdParts[idx] = [prev, fenceText].filter((x) => String(x).length > 0).join("\n\n");
    }
    last = m.index + m[0].length;
  }
  mdParts.push(partitionLineBlock(core.slice(last), a2uiOrdered));

  const markdown = mdParts
    .map((p) => p.replace(/\n{3,}/g, "\n\n").trimEnd())
    .filter((p) => p.length > 0)
    .join("\n\n")
    .trim();

  if (a2uiOrdered.length === 0) return { markdown };
  return { markdown, a2uiV09Jsonl: a2uiOrdered.join("\n") };
}

export function assistantChatMarkdownWithoutA2uiV09(body: string): string {
  return partitionAssistantTextForA2uiV09(body).markdown.trim();
}

