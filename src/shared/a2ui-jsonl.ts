/**
 * Detect and extract A2UI JSONL lines from assistant text (v0.8-style messages).
 */

import { validateA2uiJsonlLinesStrict } from "./a2ui-strict-validate";

/**
 * When true, apply LLM shortcut coercion, column layout repair, and inferred `beginRendering`.
 * Default false: strict v0.8 only (Zod-valid messages; see A2UI quickstart).
 */
export const A2UI_HOST_LLM_COMPAT = false;

export type PartitionedAssistant = {
  markdown: string;
  /** Joined JSONL lines for @a2ui/react MessageProcessor, or undefined if none. */
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

function coerceToA2uiMessages(
  raw: string,
): { ok: true; messages: Record<string, unknown>[] } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: false, error: "jsonl is empty" };

  try {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j)) {
      const msgs: Record<string, unknown>[] = [];
      for (const item of j) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return { ok: false, error: "JSON array must contain only objects." };
        }
        const rec = item as Record<string, unknown>;
        const n = normalizeAlternateA2uiShape(rec) ?? (isA2uiServerMessage(rec) ? rec : null);
        if (!n || !isA2uiServerMessage(n)) {
          return {
            ok: false,
            error:
              "Each array element must be an A2UI v0.8 message (or { type: surfaceUpdate | beginRendering | ... }).",
          };
        }
        msgs.push(n);
      }
      return { ok: true, messages: msgs };
    }
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const rec = j as Record<string, unknown>;
      const n = normalizeAlternateA2uiShape(rec) ?? (isA2uiServerMessage(rec) ? rec : null);
      if (!n || !isA2uiServerMessage(n)) {
        return {
          ok: false,
          error:
            "JSON must be an A2UI v0.8 message or use type: surfaceUpdate | beginRendering | dataModelUpdate | deleteSurface.",
        };
      }
      return { ok: true, messages: [n] };
    }
  } catch {
    /* try multi-object split or NDJSON */
  }

  const chunks = splitTopLevelJsonObjects(t);
  if (chunks.length > 0) {
    const msgs: Record<string, unknown>[] = [];
    for (const ch of chunks) {
      try {
        const rec = JSON.parse(ch) as Record<string, unknown>;
        const n = normalizeAlternateA2uiShape(rec) ?? (isA2uiServerMessage(rec) ? rec : null);
        if (!n || !isA2uiServerMessage(n)) {
          return {
            ok: false,
            error:
              "Each JSON object must be A2UI v0.8 (or alternate { type: surfaceUpdate | ... } shape).",
          };
        }
        msgs.push(n);
      } catch {
        return { ok: false, error: "Invalid JSON in multi-object payload." };
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
      const n = normalizeAlternateA2uiShape(rec) ?? (isA2uiServerMessage(rec) ? rec : null);
      if (!n || !isA2uiServerMessage(n)) {
        return {
          ok: false,
          error:
            "Each line must be A2UI v0.8 JSON (or { type: surfaceUpdate | ... }); or send one pretty-printed JSON / multiple { ... }{...} objects.",
        };
      }
      msgs.push(n);
    } catch {
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
      /* not JSON */
    }
    otherLines.push(line);
  }
  return otherLines.join("\n");
}

/**
 * Split streamed assistant text into markdown vs A2UI JSONL lines.
 * Whole-line JSON objects, plus complete fenced ``` / ```json blocks containing JSON or NDJSON.
 */
export function partitionAssistantTextForA2ui(full: string): PartitionedAssistant {
  const trimmed = full.trim();
  if (!trimmed) return { markdown: "" };

  const a2uiOrdered: string[] = [];
  const mdParts: string[] = [];
  let last = 0;
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(full)) !== null) {
    const before = full.slice(last, m.index);
    mdParts.push(partitionLineBlock(before, a2uiOrdered));
    extractA2uiFromFenceInner(m[2] ?? "", a2uiOrdered);
    last = m.index + m[0].length;
  }
  mdParts.push(partitionLineBlock(full.slice(last), a2uiOrdered));

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
    const cb = comp.Checkbox as Record<string, unknown>;
    if (typeof cb.label === "string") cb.label = coerceStringValue(cb.label);
  }

  if (comp.Button && typeof comp.Button === "object" && !Array.isArray(comp.Button)) {
    const b = comp.Button as Record<string, unknown>;
    const needsChild =
      typeof b.child !== "string" || !String(b.child).trim();
    if (needsChild) {
      const labelText =
        typeof b.label === "string"
          ? b.label
          : typeof b.text === "string"
            ? b.text
            : "Button";
      const tid = allocSyntheticId(id, ids);
      extras.push({
        id: tid,
        component: { Text: { text: { literalString: labelText } } },
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

const MAX_A2UI_SUBMIT_CHARS = 512_000;

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

/** Validates JSONL for `intelligent_a2ui_submit` (v0.8 keys or alternate `{ type }` shapes). */
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
  let joined = coerced.messages.map((m) => JSON.stringify(m)).join("\n");
  if (A2UI_HOST_LLM_COMPAT) {
    joined = coerceLlmShortcutsInA2uiJsonl(joined);
  }
  joined = orderA2uiJsonlServerMessages(joined);
  const strict = validateA2uiJsonlLinesStrict(joined);
  if (!strict.ok) {
    return { ok: false, error: strict.error };
  }
  return { ok: true, normalized: joined };
}

/** Collect normalized JSONL from persisted `intelligent_a2ui_submit` tool messages. */
export function collectA2uiJsonlFromToolMessages(
  toolMsgs: ReadonlyArray<{ role?: string; name?: string; arguments?: string }>,
): string | undefined {
  const chunks: string[] = [];
  for (const m of toolMsgs) {
    if (m.role !== "tool" || m.name !== "intelligent_a2ui_submit") continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(m.arguments || "{}") as Record<string, unknown>;
    } catch {
      continue;
    }
    const raw = typeof args.jsonl === "string" ? args.jsonl : "";
    const v = validateIntelligentA2uiSubmitJsonl(raw);
    if (v.ok) chunks.push(v.normalized);
  }
  return mergeA2uiJsonlParts(...chunks);
}
