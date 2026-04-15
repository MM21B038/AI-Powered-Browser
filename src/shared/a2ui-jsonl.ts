/**
 * Detect and extract A2UI JSONL lines from assistant text (v0.8-style messages).
 */

import { validateA2uiJsonlLinesStrict } from "./a2ui-strict-validate";

/**
 * When true, apply LLM shortcut coercion, column layout repair, and inferred `beginRendering`.
 * Default false: strict v0.8 only (Zod-valid messages; see A2UI quickstart).
 */
export const A2UI_HOST_LLM_COMPAT = true;

export type PartitionedAssistant = {
  markdown: string;
  /** Joined JSONL lines for `@a2ui/react/v0_8` MessageProcessor, or undefined if none. */
  a2uiJsonl?: string;
};

export function isA2uiServerMessage(obj: Record<string, unknown>): boolean {
  return Boolean(
    obj.surfaceUpdate ||
      obj.dataModelUpdate ||
      obj.beginRendering ||
      obj.deleteSurface ||
      (typeof obj.version === "string" && obj.createSurface),
  );
}

/**
 * Maps LLM / alternate shapes (`{ "type": "surfaceUpdate", ... }`) to A2UI v0.8
 * top-level keys (`{ "surfaceUpdate": { ... } }`). Returns null if not recognized.
 */
export function normalizeAlternateA2uiShape(
  obj: Record<string, unknown>,
): Record<string, unknown> | null {
  if (isA2uiServerMessage(obj)) return obj;
  const typ = obj.type;
  if (typeof typ !== "string") return null;
  const t = typ.trim();
  if (t === "surfaceUpdate") {
    return {
      surfaceUpdate: {
        surfaceId: typeof obj.surfaceId === "string" ? obj.surfaceId : "main",
        components: Array.isArray(obj.components) ? obj.components : [],
      },
    };
  }
  if (t === "beginRendering") {
    return {
      beginRendering: {
        surfaceId: typeof obj.surfaceId === "string" ? obj.surfaceId : "main",
        root: typeof obj.root === "string" ? obj.root : "",
      },
    };
  }
  if (t === "dataModelUpdate") {
    return {
      dataModelUpdate: {
        surfaceId: typeof obj.surfaceId === "string" ? obj.surfaceId : "main",
        ...(typeof obj.path === "string" ? { path: obj.path } : {}),
        contents: Array.isArray(obj.contents) ? obj.contents : [],
      },
    };
  }
  if (t === "deleteSurface") {
    return {
      deleteSurface: {
        surfaceId: typeof obj.surfaceId === "string" ? obj.surfaceId : "main",
      },
    };
  }
  return null;
}

/**
 * Fixes common transport mistakes before parsing:
 * - Two JSON objects concatenated with a **literal** `\n` (backslash + `n`) instead of a real newline.
 */
function preprocessA2uiToolJsonlString(s: string): string {
  return s.replace(/\}\s*\\n\s*\{/g, "}\n{");
}

/**
 * Models often emit **one extra `}`** after the first `Column` / `Row` in `surfaceUpdate.components`,
 * yielding `...}}}},{"id":` instead of `...}}}},{"id":` — `JSON.parse` then fails with
 * "Expected ',' or ']' after array element" around column ~250.
 * Repeatedly fold `}}}}` → `}}}` immediately before `,{"id":` (with optional whitespace).
 */
function tryParseJsonLineWithExtraBraceRepair(line: string): Record<string, unknown> | null {
  let s = line;
  for (let k = 0; k < 64; k++) {
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      const re = /\}\}\}\}(\s*,\s*\{\s*"id"\s*:)/;
      const next = s.replace(re, "}}}$1");
      if (next === s) break;
      s = next;
    }
  }
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * True when the **last non-empty line** is not yet valid JSON (common while NDJSON is still streaming).
 * The UI should show a “building” state instead of flashing a validation error mid-stream.
 */
export function isLikelyIncompleteStreamingA2uiJsonl(jsonl: string): boolean {
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

/** Split top-level `{...}` JSON objects (handles pretty-printed multi-object blobs). */
function splitTopLevelJsonObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

/**
 * When one physical line contains **multiple** top-level `{...}{...}` objects (no newline between them),
 * split and validate each. Returns null if this is not a glued multi-object line.
 */
function tryParseGluedJsonObjectsLine(line: string): Record<string, unknown>[] | null {
  const chunks = splitTopLevelJsonObjects(line);
  if (chunks.length < 2) return null;
  const out: Record<string, unknown>[] = [];
  for (const ch of chunks) {
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(ch) as Record<string, unknown>;
    } catch {
      const repaired = tryParseJsonLineWithExtraBraceRepair(ch);
      if (repaired === null) return null;
      rec = repaired;
    }
    const n =
      normalizeAlternateA2uiShape(rec) ?? (isA2uiServerMessage(rec) ? rec : null);
    if (!n || !isA2uiServerMessage(n)) return null;
    out.push(n);
  }
  return out;
}

/** If `dataModelUpdate.contents` has JSON strings where objects are required, parse them in place. */
function repairDataModelUpdateContentsInMessage(msg: Record<string, unknown>): void {
  const dmu = msg.dataModelUpdate;
  if (!dmu || typeof dmu !== "object" || Array.isArray(dmu)) return;
  const dm = dmu as Record<string, unknown>;
  const contents = dm.contents;
  if (!Array.isArray(contents)) return;
  const next: unknown[] = [];
  for (const item of contents) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t.startsWith("{") && t.endsWith("}")) {
        try {
          const parsed = JSON.parse(t) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            next.push(parsed);
            continue;
          }
        } catch {
          /* keep string */
        }
      }
    }
    next.push(item);
  }
  dm.contents = next;
}

/**
 * True when the payload looks like **compact NDJSON**: multiple lines, each a single top-level `{...}` object.
 * This path runs before `splitTopLevelJsonObjects` so we parse each line with `JSON.parse` independently —
 * the brace splitter can mis-cut or fail opaquely when a line has invalid JSON (e.g. extra `}`).
 */
/**
 * v0.8 requires **exactly one** of surfaceUpdate | dataModelUpdate | beginRendering | deleteSurface per message.
 * Models sometimes emit a **single JSON object** with two or more of those keys — split into ordered messages.
 */
function splitCombinedA2uiRootMessage(rec: Record<string, unknown>): Record<string, unknown>[] {
  const order = [
    "surfaceUpdate",
    "dataModelUpdate",
    "beginRendering",
    "deleteSurface",
  ] as const;
  const present = order.filter(
    (k) => rec[k] != null && typeof rec[k] === "object",
  );
  if (present.length <= 1) return [rec];
  return present.map((k) => ({ [k]: rec[k] }) as Record<string, unknown>);
}

function expandRecordToNormalizedMessages(
  rec: Record<string, unknown>,
): Record<string, unknown>[] | null {
  const parts = splitCombinedA2uiRootMessage(rec);
  const out: Record<string, unknown>[] = [];
  for (const p of parts) {
    const n =
      normalizeAlternateA2uiShape(p) ?? (isA2uiServerMessage(p) ? p : null);
    if (!n || !isA2uiServerMessage(n)) return null;
    out.push(n);
  }
  return out;
}

function tryCoerceNdjsonCompactLines(
  t: string,
):
  | { ok: true; messages: Record<string, unknown>[] }
  | { ok: false; error: string }
  | null {
  const lines = t
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length < 2) return null;
  if (!lines.every((l) => l.startsWith("{") && l.endsWith("}"))) return null;

  const msgs: Record<string, unknown>[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch (e) {
      const repaired = tryParseJsonLineWithExtraBraceRepair(line);
      if (repaired !== null) {
        rec = repaired;
      } else {
        const glued = tryParseGluedJsonObjectsLine(line);
        if (glued !== null && glued.length > 0) {
          for (const g of glued) {
            const expanded = expandRecordToNormalizedMessages(g);
            if (!expanded) {
              return {
                ok: false,
                error: `Line ${i + 1}: not a valid A2UI v0.8 message (or alternate { type: surfaceUpdate | beginRendering | ... } shape).`,
              };
            }
            msgs.push(...expanded);
          }
          continue;
        }
        const detail = e instanceof SyntaxError ? e.message : String(e);
        return {
          ok: false,
          error: `Line ${i + 1}: invalid JSON (${detail}). Fix the JSON on this line (often an extra or missing brace, or two root objects on one line without a newline).`,
        };
      }
    }
    const expanded = expandRecordToNormalizedMessages(rec);
    if (!expanded) {
      return {
        ok: false,
        error: `Line ${i + 1}: not a valid A2UI v0.8 message (or alternate { type: surfaceUpdate | beginRendering | ... } shape).`,
      };
    }
    msgs.push(...expanded);
  }
  return { ok: true, messages: msgs };
}

function coerceToA2uiMessages(
  raw: string,
): { ok: true; messages: Record<string, unknown>[] } | { ok: false; error: string } {
  const t = preprocessA2uiToolJsonlString(raw.trim());
  if (!t) return { ok: false, error: "jsonl is empty" };

  try {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j)) {
      const msgs: Record<string, unknown>[] = [];
      for (const item of j) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return { ok: false, error: "JSON array must contain only objects." };
        }
        const expanded = expandRecordToNormalizedMessages(item as Record<string, unknown>);
        if (!expanded) {
          return {
            ok: false,
            error:
              "Each array element must be an A2UI v0.8 message (or { type: surfaceUpdate | beginRendering | ... }).",
          };
        }
        msgs.push(...expanded);
      }
      return { ok: true, messages: msgs };
    }
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const expanded = expandRecordToNormalizedMessages(j as Record<string, unknown>);
      if (!expanded) {
        return {
          ok: false,
          error:
            "JSON must be an A2UI v0.8 message or use type: surfaceUpdate | beginRendering | dataModelUpdate | deleteSurface.",
        };
      }
      return { ok: true, messages: expanded };
    }
  } catch {
    /* try multi-object split or NDJSON */
  }

  const compactNdjson = tryCoerceNdjsonCompactLines(t);
  if (compactNdjson !== null) {
    return compactNdjson;
  }

  const chunks = splitTopLevelJsonObjects(t);
  if (chunks.length > 0) {
    const msgs: Record<string, unknown>[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const ch = chunks[ci]!;
      try {
        const rec = JSON.parse(ch) as Record<string, unknown>;
        const expanded = expandRecordToNormalizedMessages(rec);
        if (!expanded) {
          return {
            ok: false,
            error:
              "Each JSON object must be A2UI v0.8 (or alternate { type: surfaceUpdate | ... } shape).",
          };
        }
        msgs.push(...expanded);
      } catch (e) {
        const repaired = tryParseJsonLineWithExtraBraceRepair(ch);
        if (repaired !== null) {
          const expanded = expandRecordToNormalizedMessages(repaired);
          if (!expanded) {
            return {
              ok: false,
              error:
                "Each JSON object must be A2UI v0.8 (or alternate { type: surfaceUpdate | ... } shape).",
            };
          }
          msgs.push(...expanded);
          continue;
        }
        const detail = e instanceof SyntaxError ? e.message : String(e);
        return {
          ok: false,
          error: `Invalid JSON in multi-object payload (segment ${ci + 1} of ${chunks.length}): ${detail}`,
        };
      }
    }
    return { ok: true, messages: msgs };
  }

  const msgs: Record<string, unknown>[] = [];
  for (const rawLine of t.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const rec = JSON.parse(line) as Record<string, unknown>;
      const expanded = expandRecordToNormalizedMessages(rec);
      if (!expanded) {
        return {
          ok: false,
          error:
            "Each line must be A2UI v0.8 JSON (or { type: surfaceUpdate | ... }); or send one pretty-printed JSON / multiple { ... }{...} objects.",
        };
      }
      msgs.push(...expanded);
    } catch {
      const repaired = tryParseJsonLineWithExtraBraceRepair(line);
      if (repaired !== null) {
        const expanded = expandRecordToNormalizedMessages(repaired);
        if (!expanded) {
          return {
            ok: false,
            error:
              "Each line must be A2UI v0.8 JSON (or { type: surfaceUpdate | ... }); or send one pretty-printed JSON / multiple { ... }{...} objects.",
          };
        }
        msgs.push(...expanded);
        continue;
      }
      return {
        ok: false,
        error:
          "Could not parse as JSON. Use one object per line, a single JSON array, one pretty-printed object, or multiple {...} objects.",
      };
    }
  }
  if (msgs.length === 0) return { ok: false, error: "No messages found" };
  return { ok: true, messages: msgs };
}

/** GitHub-style fenced code blocks; group 1 is inner body (no trailing fence line). */
const FENCE_RE = /```([a-zA-Z0-9_-]*)\s*\r?\n([\s\S]*?)\r?\n```/g;

/**
 * If the **last** ` ```json` / ` ```jsonl` fence in `full` has no closing ``` line yet, returns
 * markdown before that fence line and the inner body after the opening fence header.
 */
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
  const fenceLineStart =
    lastMatch.index + (lastMatch[0].startsWith("\n") ? 1 : 0);
  const markdownPrefix = full.slice(0, fenceLineStart);
  return { markdownPrefix, inner };
}

function tryPushA2uiObject(obj: unknown, a2uiOrdered: string[]): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const rec = obj as Record<string, unknown>;
  const n =
    normalizeAlternateA2uiShape(rec) ?? (isA2uiServerMessage(rec) ? rec : null);
  if (!n || !isA2uiServerMessage(n)) return false;
  a2uiOrdered.push(JSON.stringify(n));
  return true;
}

function extractA2uiFromFenceInner(inner: string, a2uiOrdered: string[]): void {
  const t = inner.trim();
  if (!t) return;
  try {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j)) {
      for (const item of j) {
        tryPushA2uiObject(item, a2uiOrdered);
      }
      return;
    }
    if (tryPushA2uiObject(j, a2uiOrdered)) return;
  } catch {
    /* fall through */
  }
  const coerced = coerceToA2uiMessages(t);
  if (coerced.ok) {
    for (const m of coerced.messages) {
      a2uiOrdered.push(JSON.stringify(m));
    }
    return;
  }
  for (const line of inner.split(/\r?\n/)) {
    const lt = line.trim();
    if (!lt) continue;
    try {
      const j = JSON.parse(lt) as unknown;
      tryPushA2uiObject(j, a2uiOrdered);
    } catch {
      /* skip */
    }
  }
}

function partitionLineBlock(block: string, a2uiOrdered: string[]): string {
  const otherLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) {
      otherLines.push(line);
      continue;
    }
    try {
      const j = JSON.parse(t) as unknown;
      if (tryPushA2uiObject(j, a2uiOrdered)) continue;
    } catch {
      /**
       * Streaming UX: models often stream partial JSONL lines (not yet parseable).
       * If the line looks like an A2UI server message, hide it from markdown so users
       * see the panel building instead of raw JSON tokens.
       */
      if (
        t.startsWith("{") &&
        /"(surfaceUpdate|dataModelUpdate|beginRendering|deleteSurface)"\s*:/.test(t)
      ) {
        continue;
      }
    }
    otherLines.push(line);
  }
  return otherLines.join("\n");
}

/**
 * Split streamed assistant text into markdown vs A2UI JSONL lines.
 * Whole-line JSON objects, complete fenced blocks, and **open** trailing ` ```json` / ` ```jsonl`
 * fences (streaming) containing JSON or NDJSON.
 */
/**
 * Markdown-only view of assistant text after removing lines/fences ingested as A2UI.
 * Use when `a2uiJsonl` is stored separately so the chat bubble does not duplicate raw NDJSON.
 */
export function assistantChatMarkdownWithoutA2ui(body: string): string {
  return partitionAssistantTextForA2ui(body).markdown.trim();
}

export function partitionAssistantTextForA2ui(full: string): PartitionedAssistant {
  const trimmed = full.trim();
  if (!trimmed) return { markdown: "" };

  const a2uiOrdered: string[] = [];
  const open = findTrailingOpenJsonOrJsonlFence(full);
  const core = open?.markdownPrefix ?? full;
  if (open) {
    extractA2uiFromFenceInner(open.inner, a2uiOrdered);
  }

  const mdParts: string[] = [];
  let last = 0;
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(core)) !== null) {
    const before = core.slice(last, m.index);
    mdParts.push(partitionLineBlock(before, a2uiOrdered));
    const a2uiCountBeforeFence = a2uiOrdered.length;
    extractA2uiFromFenceInner(m[2] ?? "", a2uiOrdered);
    /** If the fence was not valid A2UI, keep the full ```…``` block in markdown (HTML/CSS/etc.). */
    if (a2uiOrdered.length === a2uiCountBeforeFence) {
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
  return {
    markdown,
    a2uiJsonl: a2uiOrdered.join("\n"),
  };
}

function setNestedSurfaceId(
  msg: Record<string, unknown>,
  key: string,
  surfaceId: string,
): void {
  const inner = msg[key];
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return;
  (inner as Record<string, unknown>).surfaceId = surfaceId;
}

/**
 * Rewrites every `surfaceId` in known v0.8 server message shapes so `A2UIRenderer`
 * matches the host-owned surface id (e.g. `a2ui-${messageId}`).
 */
export function rewriteA2uiJsonlSurfaceIds(jsonl: string, surfaceId: string): string {
  const lines: string[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      setNestedSurfaceId(j, "beginRendering", surfaceId);
      setNestedSurfaceId(j, "surfaceUpdate", surfaceId);
      setNestedSurfaceId(j, "dataModelUpdate", surfaceId);
      setNestedSurfaceId(j, "deleteSurface", surfaceId);
      lines.push(JSON.stringify(j));
    } catch {
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function getLayoutKind(inner: Record<string, unknown>): "Column" | "Row" | "List" | null {
  if (inner.Column) return "Column";
  if (inner.Row) return "Row";
  if (inner.List) return "List";
  return null;
}

function layoutKindForInstance(c: Record<string, unknown>): "Column" | "Row" | "List" | null {
  const inner = c.component;
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return null;
  return getLayoutKind(inner as Record<string, unknown>);
}

/**
 * Prefer a Column/Row/List as the render root so we do not anchor the tree on the first Text leaf
 * (which would hide Sliders and other siblings).
 */
export function pickRenderingRootFromComponents(components: unknown): string | null {
  if (!Array.isArray(components) || components.length === 0) return null;
  const list = components.filter(
    (c): c is Record<string, unknown> =>
      !!c && typeof c === "object" && !Array.isArray(c) && typeof (c as { id?: unknown }).id === "string",
  );
  if (list.length === 0) return null;

  const rootNamed = list.find((c) => c.id === "root");
  if (rootNamed && layoutKindForInstance(rootNamed)) {
    return rootNamed.id as string;
  }

  const layoutFirst = list.find((c) => layoutKindForInstance(c));
  if (layoutFirst && typeof layoutFirst.id === "string") return layoutFirst.id;

  if (rootNamed && typeof rootNamed.id === "string") return rootNamed.id;

  const first = list[0];
  if (first && typeof first.id === "string" && first.id.length > 0) return first.id;

  return null;
}

/** If beginRendering points at a Text (etc.) leaf but a layout container exists, switch root to the container. */
function pickBetterRenderingRoot(components: unknown, currentRoot: string): string {
  if (!Array.isArray(components)) return currentRoot;
  const list = components.filter(
    (c): c is Record<string, unknown> =>
      !!c && typeof c === "object" && !Array.isArray(c) && typeof (c as { id?: unknown }).id === "string",
  );
  const current = list.find((c) => c.id === currentRoot);
  if (current && layoutKindForInstance(current)) return currentRoot;

  const preferRoot = list.find((c) => c.id === "root" && layoutKindForInstance(c));
  if (preferRoot && typeof preferRoot.id === "string") return preferRoot.id;

  const anyLayout = list.find((c) => layoutKindForInstance(c));
  if (anyLayout && typeof anyLayout.id === "string") return anyLayout.id;

  return currentRoot;
}

/**
 * Ensures a single top-level Column/Row/List lists every other component id in order (common LLM mistake:
 * empty explicitList or only listing Text nodes, which hides Sliders).
 */
export function repairSurfaceUpdateLayout(components: unknown): void {
  if (!Array.isArray(components)) return;
  const list = components.filter(
    (c): c is Record<string, unknown> =>
      !!c && typeof c === "object" && !Array.isArray(c) && typeof (c as { id?: unknown }).id === "string",
  );
  if (list.length < 2) return;

  const allIds = list.map((c) => c.id as string);
  const layouts = list
    .map((c, i) => ({ c, i, k: layoutKindForInstance(c) }))
    .filter((x) => x.k === "Column" || x.k === "Row" || x.k === "List");

  if (layouts.length === 1) {
    const { c, k } = layouts[0]!;
    const selfId = c.id as string;
    const inner = c.component as Record<string, unknown>;
    const L = inner[k!] as Record<string, unknown> | undefined;
    if (!L || typeof L !== "object") return;
    const ch = L.children as Record<string, unknown> | undefined;
    if (ch && typeof ch === "object" && ch.template) return;
    L.children = { explicitList: allIds.filter((id) => id !== selfId) };
  } else if (layouts.length > 1) {
    const target =
      list.find((c) => c.id === "root" && layoutKindForInstance(c)) ??
      list.find((c) => layoutKindForInstance(c) === "Column");
    if (!target) return;
    const lk = layoutKindForInstance(target);
    if (!lk) return;
    const inner = target.component as Record<string, unknown>;
    const L = inner[lk] as Record<string, unknown> | undefined;
    if (!L || typeof L !== "object") return;
    const ch = L.children as Record<string, unknown> | undefined;
    if (ch && typeof ch === "object" && ch.template) return;
    const expl = ch && Array.isArray(ch.explicitList) ? ch.explicitList : [];
    const empty =
      !ch || typeof ch !== "object" || (!Array.isArray(ch.explicitList) && !ch.template);
    if (empty || expl.length === 0) {
      L.children = { explicitList: allIds.filter((id) => id !== (target.id as string)) };
    }
  }
}

/**
 * JSONL pass: repair layout roots for each surfaceUpdate line.
 */
export function repairA2uiLayoutInJsonl(jsonl: string): string {
  const lines: string[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const su = j.surfaceUpdate;
      if (su && typeof su === "object" && !Array.isArray(su) && "components" in su) {
        repairSurfaceUpdateLayout((su as { components: unknown }).components);
      }
      lines.push(JSON.stringify(j));
    } catch {
      lines.push(line);
    }
  }
  return lines.join("\n");
}

/**
 * Aligns with the v0.8 protocol stream: buffer `surfaceUpdate` / `dataModelUpdate` before `beginRendering`.
 * Stable-sorts lines so `beginRendering` is last (see `specification/v0_8/docs/a2ui_protocol.md` in the upstream repo).
 */
export function orderA2uiJsonlServerMessages(jsonl: string): string {
  const rawLines = jsonl.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (rawLines.length <= 1) return rawLines.join("\n");

  type Entry = { line: string; idx: number; rank: number };
  const entries: Entry[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    let rank = 0;
    try {
      const m = JSON.parse(line) as Record<string, unknown>;
      if (m.beginRendering != null) rank = 3;
      else if (m.deleteSurface != null) rank = 2;
      else if (m.dataModelUpdate != null) rank = 1;
      else if (m.surfaceUpdate != null) rank = 0;
    } catch {
      rank = 0;
    }
    entries.push({ line, idx: i, rank });
  }
  entries.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.idx - b.idx));
  return entries.map((e) => e.line).join("\n");
}

function inferRootFromComponents(components: unknown): string | null {
  return pickRenderingRootFromComponents(components);
}

/**
 * Ensures a `beginRendering` message exists when there are `surfaceUpdate` components,
 * and fills missing `root` on `beginRendering` when inferrable (v0.8 clients buffer until beginRendering).
 */
export function ensureBeginRenderingForJsonl(jsonl: string, surfaceId: string): string {
  const rawLines = jsonl.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return jsonl;

  const parsed: Array<Record<string, unknown> | null> = rawLines.map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return null;
    }
  });

  let lastComponents: unknown = undefined;
  for (const j of parsed) {
    if (!j) continue;
    const su = j.surfaceUpdate as { components?: unknown } | undefined;
    if (su?.components != null) lastComponents = su.components;
  }

  const inferredRoot = inferRootFromComponents(lastComponents);

  const out: string[] = [];
  let hasBegin = false;
  for (let i = 0; i < parsed.length; i++) {
    const j = parsed[i];
    const raw = rawLines[i]!;
    if (!j) {
      out.push(raw);
      continue;
    }
    if (j.beginRendering && typeof j.beginRendering === "object" && j.beginRendering !== null) {
      hasBegin = true;
      const br = { ...(j.beginRendering as Record<string, unknown>) };
      if (typeof br.surfaceId !== "string" || !String(br.surfaceId).trim()) {
        br.surfaceId = surfaceId;
      }
      let rootStr = typeof br.root === "string" ? br.root.trim() : "";
      if (!rootStr && inferredRoot) {
        br.root = inferredRoot;
      } else if (rootStr && lastComponents) {
        br.root = pickBetterRenderingRoot(lastComponents, rootStr);
      }
      out.push(JSON.stringify({ beginRendering: br }));
      continue;
    }
    out.push(JSON.stringify(j));
  }

  if (!hasBegin && inferredRoot) {
    out.push(JSON.stringify({ beginRendering: { surfaceId, root: inferredRoot } }));
  }

  return out.join("\n");
}

/** v0.8 `StringValue`: exactly one of path | literalString | literal. */
function coerceStringValue(val: unknown): Record<string, unknown> {
  if (typeof val === "string") return { literalString: val };
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const o = val as Record<string, unknown>;
    if (
      typeof o.path === "string" ||
      typeof o.literalString === "string" ||
      typeof o.literal === "string"
    ) {
      return o;
    }
  }
  return { literalString: String(val ?? "") };
}

/** v0.8 number binding for Slider etc.: exactly one of path | literalNumber | literal (number). */
function coerceNumberBinding(val: unknown, fallback: number): Record<string, unknown> {
  if (typeof val === "number" && Number.isFinite(val)) return { literalNumber: val };
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const o = val as Record<string, unknown>;
    if (typeof o.path === "string") return { path: o.path };
    if (typeof o.literalNumber === "number") return { literalNumber: o.literalNumber };
    if (typeof o.literal === "number") return { literalNumber: o.literal };
  }
  return { literalNumber: fallback };
}

function allocSyntheticId(base: string, ids: Set<string>): string {
  let n = 0;
  let id = `${base}__a2ui`;
  while (ids.has(id)) {
    n += 1;
    id = `${base}__a2ui_${n}`;
  }
  ids.add(id);
  return id;
}

const A2UI_TEXT_FIELD_TYPES = new Set(["shortText", "number", "date", "longText"]);

/** v0.8 `action.context` is `{ key, value }[]`; models often send a single object map. */
function coerceButtonActionContext(ctx: unknown): unknown[] | undefined {
  if (ctx === undefined || ctx === null) return undefined;
  if (Array.isArray(ctx)) return ctx;
  if (typeof ctx === "object" && !Array.isArray(ctx)) {
    const out: Record<string, unknown>[] = [];
    for (const [key, val] of Object.entries(ctx as Record<string, unknown>)) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        out.push({ key, value: val });
      }
    }
    return out;
  }
  return undefined;
}

function stringFromMaybeLiteralLabel(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.literalString === "string") return o.literalString;
  }
  return undefined;
}

/** Models often send `"true"` / `"false"` strings or nested `valueBoolean` instead of `value.literalBoolean`. */
function parseLooseBoolean(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no" || s === "") return false;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.literalString === "string") return parseLooseBoolean(o.literalString);
    if (typeof o.literalBoolean === "boolean") return o.literalBoolean;
    if (o.valueBoolean !== undefined) return parseLooseBoolean(o.valueBoolean);
  }
  return false;
}

/**
 * v0.8 `Checkbox` requires `label` (StringValue) and `value` (`{ path }` or `{ literalBoolean }` only).
 * LLMs often emit `valueBoolean`, `value: { valueBoolean: … }`, or `valueBoolean` nested under `literalString`.
 */
function coerceCheckboxShape(cb: Record<string, unknown>): void {
  if (cb.label === undefined) {
    cb.label = { literalString: "" };
  } else if (typeof cb.label === "string") {
    cb.label = coerceStringValue(cb.label);
  }

  if (cb.value === undefined && cb.valueBoolean !== undefined) {
    cb.value = { literalBoolean: parseLooseBoolean(cb.valueBoolean) };
    delete cb.valueBoolean;
  }

  if (cb.value && typeof cb.value === "object" && !Array.isArray(cb.value)) {
    const val = cb.value as Record<string, unknown>;
    if (typeof val.path === "string") {
      cb.value = { path: val.path };
    } else if (typeof val.literalBoolean === "boolean") {
      cb.value = { literalBoolean: val.literalBoolean };
    } else if (val.valueBoolean !== undefined) {
      cb.value = { literalBoolean: parseLooseBoolean(val.valueBoolean) };
      delete val.valueBoolean;
    } else if (
      typeof val.literalString === "string" &&
      val.path === undefined &&
      val.literalBoolean === undefined
    ) {
      cb.value = { literalBoolean: parseLooseBoolean(val.literalString) };
    } else if (Object.keys(val).length === 0) {
      cb.value = { literalBoolean: false };
    }
  }

  if (cb.checked !== undefined && cb.value === undefined) {
    if (typeof cb.checked === "boolean") {
      cb.value = { literalBoolean: cb.checked };
    }
    delete cb.checked;
  }

  if (cb.value === undefined) {
    cb.value = { literalBoolean: false };
  }

  delete cb.valueBoolean;
}

/** Matches \`TextSchema.usageHint\` in \`@a2ui/web_core\` v0.8. */
const COERCE_TEXT_USAGE_HINT_ALLOWED = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "caption",
  "body",
]);

const COERCE_TEXT_USAGE_HINT_ALIASES: Record<string, string> = {
  title: "h3",
  header: "h2",
  heading: "h2",
  subtitle: "caption",
  subheading: "h4",
  label: "caption",
  fine: "caption",
  button: "body",
  btn: "body",
  cta: "body",
  paragraph: "body",
  p: "body",
  text: "body",
};

function normalizeCoercedTextUsageHint(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (COERCE_TEXT_USAGE_HINT_ALLOWED.has(t)) return t;
  const mapped = COERCE_TEXT_USAGE_HINT_ALIASES[t.toLowerCase()];
  if (mapped) return mapped;
  return undefined;
}

/** \`children.template.dataBinding\` must be a string; models often send \`{ path: "…" }\`. */
function coerceLayoutChildrenTemplateBinding(layout: Record<string, unknown>): void {
  const ch = layout.children;
  if (!ch || typeof ch !== "object" || Array.isArray(ch)) return;
  const children = ch as Record<string, unknown>;
  const tpl = children.template;
  if (!tpl || typeof tpl !== "object" || Array.isArray(tpl)) return;
  const t = tpl as Record<string, unknown>;
  const db = t.dataBinding;
  if (typeof db === "string") return;
  if (
    db &&
    typeof db === "object" &&
    !Array.isArray(db) &&
    typeof (db as { path?: unknown }).path === "string"
  ) {
    t.dataBinding = (db as { path: string }).path;
  }
}

/**
 * Coerces common LLM “shortcut” component shapes into strict A2UI v0.8 (Zod) shapes.
 * Mutates component objects in place and may append synthetic Text nodes for Button labels.
 */
function coerceComponentInstance(
  inst: Record<string, unknown>,
  ids: Set<string>,
  extras: Record<string, unknown>[],
): void {
  const id = typeof inst.id === "string" ? inst.id : "anon";
  if (typeof inst.id === "string") ids.add(inst.id);

  const inner = inst.component;
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return;
  const comp = inner as Record<string, unknown>;

  if (comp.CheckBox && typeof comp.CheckBox === "object" && !Array.isArray(comp.CheckBox)) {
    comp.Checkbox = comp.CheckBox;
    delete comp.CheckBox;
  }

  /** v0.8 `Card` is `{ child: string }` only; models often send `content` / `childId`. */
  if (comp.Card && typeof comp.Card === "object" && !Array.isArray(comp.Card)) {
    const card = comp.Card as Record<string, unknown>;
    if (typeof card.child !== "string" || !card.child.trim()) {
      const alt =
        (typeof card.childId === "string" && card.childId.trim() && card.childId) ||
        (typeof card.content === "string" && card.content.trim() && card.content) ||
        undefined;
      if (alt) card.child = alt;
      delete card.childId;
      delete card.content;
    }
  }

  if (typeof comp.Text !== "undefined") {
    if (typeof comp.Text === "string") {
      comp.Text = { text: { literalString: comp.Text } };
    } else if (comp.Text && typeof comp.Text === "object" && !Array.isArray(comp.Text)) {
      const T = comp.Text as Record<string, unknown>;
      if (T.text === undefined && T.content != null) {
        T.text = coerceStringValue(T.content);
      } else if (typeof T.text === "string") {
        T.text = coerceStringValue(T.text);
      }
      if (T.content !== undefined) delete T.content;
      if (T.usageHint !== undefined) {
        const n = normalizeCoercedTextUsageHint(T.usageHint);
        if (n === undefined) delete T.usageHint;
        else T.usageHint = n;
      }
    }
  }

  for (const k of ["Row", "Column", "List"] as const) {
    const lay = comp[k];
    if (lay && typeof lay === "object" && !Array.isArray(lay)) {
      coerceLayoutChildrenTemplateBinding(lay as Record<string, unknown>);
    }
  }

  if (comp.Image && typeof comp.Image === "object" && !Array.isArray(comp.Image)) {
    const im = comp.Image as Record<string, unknown>;
    if (typeof im.url === "string") {
      im.url = coerceStringValue(im.url);
    } else if (im.url === undefined && im.src != null) {
      im.url = coerceStringValue(typeof im.src === "string" ? im.src : String(im.src));
      delete im.src;
    }
  }

  if (comp.Icon && typeof comp.Icon === "object" && !Array.isArray(comp.Icon)) {
    const ic = comp.Icon as Record<string, unknown>;
    if (typeof ic.name === "string") {
      ic.name = coerceStringValue(ic.name);
    }
  }

  if (comp.Video && typeof comp.Video === "object" && !Array.isArray(comp.Video)) {
    const v = comp.Video as Record<string, unknown>;
    if (typeof v.url === "string") {
      v.url = coerceStringValue(v.url);
    }
  }

  if (comp.AudioPlayer && typeof comp.AudioPlayer === "object" && !Array.isArray(comp.AudioPlayer)) {
    const a = comp.AudioPlayer as Record<string, unknown>;
    if (typeof a.url === "string") {
      a.url = coerceStringValue(a.url);
    }
  }

  if (comp.Slider && typeof comp.Slider === "object" && !Array.isArray(comp.Slider)) {
    const s = comp.Slider as Record<string, unknown>;
    if (typeof s.min === "number" && s.minValue === undefined) s.minValue = s.min;
    if (typeof s.max === "number" && s.maxValue === undefined) s.maxValue = s.max;
    delete s.min;
    delete s.max;
    delete s.step;
    const min = typeof s.minValue === "number" ? s.minValue : 0;
    if (typeof s.value === "undefined") {
      s.value = coerceNumberBinding(undefined, min);
    } else if (typeof s.value === "number") {
      s.value = coerceNumberBinding(s.value, min);
    } else if (s.value && typeof s.value === "object") {
      s.value = coerceNumberBinding(s.value, min);
    } else {
      s.value = coerceNumberBinding(undefined, min);
    }
    if (typeof s.label === "string") {
      s.label = coerceStringValue(s.label);
    }
  }

  if (comp.TextField && typeof comp.TextField === "object" && !Array.isArray(comp.TextField)) {
    const tf = comp.TextField as Record<string, unknown>;
    if (typeof tf.placeholder === "string" && tf.label === undefined) {
      tf.label = coerceStringValue(tf.placeholder);
      delete tf.placeholder;
    } else if (typeof tf.placeholder === "string") {
      delete tf.placeholder;
    }
    if (typeof tf.label === "string") tf.label = coerceStringValue(tf.label);
    if (typeof tf.text === "string") tf.text = coerceStringValue(tf.text);
    const tft = tf.textFieldType;
    if (tft && typeof tft === "object" && !Array.isArray(tft)) {
      const o = tft as Record<string, unknown>;
      if (
        typeof o.literalString === "string" &&
        A2UI_TEXT_FIELD_TYPES.has(o.literalString)
      ) {
        tf.textFieldType = o.literalString;
      }
    }
  }

  if (
    comp.MultipleChoice &&
    typeof comp.MultipleChoice === "object" &&
    !Array.isArray(comp.MultipleChoice)
  ) {
    const mc = comp.MultipleChoice as Record<string, unknown>;
    if (Array.isArray(mc.options) && mc.options.length > 0) {
      const first = mc.options[0];
      if (typeof first === "string") {
        mc.options = (mc.options as string[]).map((opt) => {
          const str = String(opt);
          return { label: { literalString: str }, value: str };
        });
      }
    }
    const opts = Array.isArray(mc.options) ? mc.options : [];
    const firstVal =
      opts.length > 0 &&
      opts[0] &&
      typeof opts[0] === "object" &&
      !Array.isArray(opts[0]) &&
      typeof (opts[0] as { value?: unknown }).value === "string"
        ? (opts[0] as { value: string }).value
        : "";
    if (!mc.selections || typeof mc.selections !== "object" || Array.isArray(mc.selections)) {
      const pick =
        typeof mc.selected === "string" && mc.selected.trim()
          ? mc.selected.trim()
          : firstVal;
      mc.selections = { literalArray: pick ? [pick] : [] };
    } else {
      const sel = mc.selections as Record<string, unknown>;
      const arr = sel.literalArray;
      if (Array.isArray(arr) && arr.length === 0 && firstVal) {
        sel.literalArray = [firstVal];
      }
    }
    delete mc.selected;
    if (typeof mc.label === "string") {
      delete mc.label;
    }
  }

  if (comp.Checkbox && typeof comp.Checkbox === "object" && !Array.isArray(comp.Checkbox)) {
    coerceCheckboxShape(comp.Checkbox as Record<string, unknown>);
  }

  if (comp.Button && typeof comp.Button === "object" && !Array.isArray(comp.Button)) {
    const b = comp.Button as Record<string, unknown>;
    if (b.action && typeof b.action === "object" && !Array.isArray(b.action)) {
      const act = b.action as Record<string, unknown>;
      if (
        act.name &&
        typeof act.name === "object" &&
        act.name !== null &&
        !Array.isArray(act.name)
      ) {
        const nm = act.name as Record<string, unknown>;
        if (typeof nm.literalString === "string") {
          act.name = nm.literalString;
        }
      }
      if (act.context !== undefined) {
        act.context = coerceButtonActionContext(act.context);
      }
    }
    const needsChild =
      typeof b.child !== "string" || !String(b.child).trim();
    if (needsChild) {
      const labelText =
        stringFromMaybeLiteralLabel(b.label) ??
        stringFromMaybeLiteralLabel(b.text) ??
        "Button";
      const tid = allocSyntheticId(id, ids);
      extras.push({
        id: tid,
        component: {
          Text: { text: { literalString: labelText }, usageHint: "body" },
        },
      });
      b.child = tid;
      delete b.label;
      delete b.text;
    }
    if (!b.action || typeof b.action !== "object" || Array.isArray(b.action)) {
      const name =
        typeof b.action === "string" && b.action.trim()
          ? b.action.trim()
          : "primaryAction";
      b.action = { name, context: [] };
    }
  }
}

function coerceSurfaceUpdateComponents(components: unknown): void {
  if (!Array.isArray(components)) return;
  const ids = new Set<string>();
  for (const c of components) {
    if (c && typeof c === "object" && !Array.isArray(c) && typeof (c as { id?: unknown }).id === "string") {
      ids.add((c as { id: string }).id);
    }
  }
  const extras: Record<string, unknown>[] = [];
  for (const c of components) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      coerceComponentInstance(c as Record<string, unknown>, ids, extras);
    }
  }
  if (extras.length > 0) {
    components.push(...extras);
  }
}

/**
 * Rewrites each JSONL message so LLM shortcuts (string Text bodies, Slider primitives, etc.)
 * match strict v0.8 schemas before `processMessages`.
 */
export function coerceLlmShortcutsInA2uiJsonl(jsonl: string): string {
  const lines: string[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const su = j.surfaceUpdate;
      if (su && typeof su === "object" && !Array.isArray(su) && "components" in su) {
        coerceSurfaceUpdateComponents((su as { components: unknown }).components);
      }
      lines.push(JSON.stringify(j));
    } catch {
      lines.push(line);
    }
  }
  return lines.join("\n");
}

/**
 * Human-readable hint when `getSurface(id).componentTree` is still null after `processMessages`
 * (missing `beginRendering`, wrong `root`, etc.).
 */
export function explainA2uiMissingComponentTree(
  messages: ReadonlyArray<Record<string, unknown>>,
): string {
  const ids = new Set<string>();
  let hasBegin = false;
  let root: string | undefined;
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const br = raw.beginRendering as { root?: unknown } | undefined;
    if (br && typeof br === "object") {
      hasBegin = true;
      if (typeof br.root === "string") root = br.root.trim();
    }
    const su = raw.surfaceUpdate as { components?: Array<{ id?: unknown }> } | undefined;
    if (su?.components && Array.isArray(su.components)) {
      for (const c of su.components) {
        if (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string") {
          ids.add((c as { id: string }).id);
        }
      }
    }
  }
  if (!hasBegin) {
    return "The A2UI stream is missing a final beginRendering line. After surfaceUpdate (and optional dataModelUpdate), add one JSONL object: {\"beginRendering\":{\"surfaceId\":\"<same as above>\",\"root\":\"<id of a component from surfaceUpdate.components>\"}}.";
  }
  if (root !== undefined && root.length === 0) {
    return "beginRendering.root is empty. Set root to the id of your top-level component (often a Column or Row that lists children in explicitList).";
  }
  if (root && ids.size > 0 && !ids.has(root)) {
    const sample = [...ids].slice(0, 10).join(", ");
    return `beginRendering.root is "${root}" but no component has that id. Use one of these ids: ${sample}${ids.size > 10 ? " …" : ""}.`;
  }
  return "The UI tree could not be built. Confirm every component matches the v0.8 catalog, surfaceId matches on every line, and component properties use literal/path shapes from the schema.";
}

const MAX_A2UI_SUBMIT_CHARS = 512_000;

/**
 * Coerces structured `jsonl` input (string, array of lines, or objects) to one NDJSON string.
 * Used for tests and any caller that still receives structured JSONL payloads.
 */
export function normalizeIntelligentA2uiSubmitJsonlInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return preprocessA2uiToolJsonlString(value);
  if (Array.isArray(value)) {
    const lines: string[] = [];
    for (const item of value) {
      if (typeof item === "string") {
        lines.push(item);
      } else if (item && typeof item === "object" && !Array.isArray(item)) {
        lines.push(JSON.stringify(item));
      }
    }
    return lines.join("\n");
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value as Record<string, unknown>);
  }
  return "";
}

/** Merge non-empty JSONL blobs (e.g. tool submit + model text) into one newline-delimited string. */
export function mergeA2uiJsonlParts(
  ...parts: Array<string | undefined>
): string | undefined {
  const merged = parts
    .filter((p): p is string => Boolean(p?.trim()))
    .join("\n")
    .trim();
  return merged.length > 0 ? merged : undefined;
}

/** Validates NDJSON for inline assistant A2UI (v0.8 keys or alternate `{ type }` shapes). */
export function validateIntelligentA2uiSubmitJsonl(
  jsonl: string,
): { ok: true; normalized: string } | { ok: false; error: string } {
  const t = jsonl.trim();
  if (!t) return { ok: false, error: "jsonl is empty" };
  if (t.length > MAX_A2UI_SUBMIT_CHARS) {
    return { ok: false, error: "jsonl exceeds size limit" };
  }
  const coerced = coerceToA2uiMessages(t);
  if (!coerced.ok) return coerced;
  for (const m of coerced.messages) {
    repairDataModelUpdateContentsInMessage(m);
  }
  let joined = coerced.messages.map((m) => JSON.stringify(m)).join("\n");
  joined = coerceLlmShortcutsInA2uiJsonl(joined);
  joined = orderA2uiJsonlServerMessages(joined);
  const strict = validateA2uiJsonlLinesStrict(joined);
  if (!strict.ok) {
    return { ok: false, error: strict.error };
  }
  return { ok: true, normalized: joined };
}
