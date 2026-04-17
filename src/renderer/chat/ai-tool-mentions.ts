/** @-mention tool names in the intelligent assistant composer (matches OpenAI function names). */

const AT_TOOL_RE = /@([a-zA-Z0-9_-]+)/g;

export function extractAtToolNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(AT_TOOL_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1];
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Non-null allowlist = restrict to these tools; null = use full enabled set. */
export function resolveToolAllowlist(mentioned: string[], enabledNames: Set<string>): string[] | null {
  const valid = [...new Set(mentioned.filter((n) => enabledNames.has(n)))].sort((a, b) =>
    a.localeCompare(b),
  );
  return valid.length > 0 ? valid : null;
}

export function unknownAtToolNames(mentioned: string[], enabledNames: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of mentioned) {
    if (enabledNames.has(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Caret is inside an active @mention if text before caret has `@` with no whitespace after it before caret. */
export function getActiveMentionQuery(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  if (caret < 0 || caret > value.length) return null;
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const afterAt = before.slice(at + 1);
  if (/\s/.test(afterAt)) return null;
  return { start: at, query: afterAt };
}

export function filterToolNameSuggestions(
  names: string[],
  query: string,
  maxVisible: number,
): string[] {
  const q = query.trim().toLowerCase();
  const scored = names.map((name) => {
    const lower = name.toLowerCase();
    const prefix = q.length === 0 || lower.startsWith(q);
    const idx = q.length ? lower.indexOf(q) : 0;
    const score =
      q.length === 0
        ? 0
        : prefix
          ? 0
          : idx >= 0
            ? 1 + idx
            : 999;
    return { name, score, prefix: prefix ? 0 : 1 };
  });
  scored.sort((a, b) => {
    if (a.prefix !== b.prefix) return a.prefix - b.prefix;
    if (a.score !== b.score) return a.score - b.score;
    return a.name.localeCompare(b.name);
  });
  const filtered =
    q.length === 0
      ? scored
      : scored.filter((s) => s.score < 999 || s.name.toLowerCase().includes(q));
  return filtered.slice(0, maxVisible).map((s) => s.name);
}

export type ToolCatalogItem = { name: string; description: string };

/** Filter/sort tools by function name and description (for @ composer). */
export function filterToolCatalogSuggestions(
  items: ToolCatalogItem[],
  query: string,
  maxVisible: number,
): ToolCatalogItem[] {
  const q = query.trim().toLowerCase();
  const scored = items.map((item) => {
    const name = item.name.toLowerCase();
    const desc = (item.description || "").toLowerCase();
    const namePrefix = q.length === 0 || name.startsWith(q);
    const nameIdx = q.length ? name.indexOf(q) : 0;
    const descIdx = q.length ? desc.indexOf(q) : 0;
    let score = 999;
    let tier = 2;
    if (q.length === 0) {
      score = 0;
      tier = 0;
    } else if (namePrefix) {
      score = 0;
      tier = 0;
    } else if (nameIdx >= 0) {
      score = 2 + nameIdx;
      tier = 1;
    } else if (descIdx >= 0) {
      score = 10 + descIdx;
      tier = 1;
    }
    return { item, score, tier };
  });
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.score !== b.score) return a.score - b.score;
    return a.item.name.localeCompare(b.item.name);
  });
  const filtered = q.length === 0 ? scored : scored.filter((s) => s.score < 999);
  return filtered.slice(0, maxVisible).map((s) => s.item);
}

export function replaceMentionAtCaret(
  value: string,
  caret: number,
  mentionStart: number,
  toolName: string,
): { next: string; caret: number } {
  const before = value.slice(0, mentionStart);
  const after = value.slice(caret);
  const insertion = `@${toolName}`;
  const next = `${before}${insertion}${after}`;
  const nextCaret = before.length + insertion.length;
  return { next, caret: nextCaret };
}
