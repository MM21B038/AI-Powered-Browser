/**
 * Extract GitHub-style pipe tables from a markdown string for structured UI (not raw MD).
 */

export type MarkdownPipeSegment =
  | { type: "text"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] };

function splitPipeRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const core = t.endsWith("|") ? t.slice(1, -1) : t.slice(1);
  return core.split("|").map((c) => c.trim());
}

function isSeparatorCells(cells: string[]): boolean {
  if (cells.length < 2) return false;
  return cells.every((cell) => {
    const t = cell.trim();
    return /^:?-{3,}:?$/.test(t);
  });
}

/**
 * Returns segments when at least one pipe table is found; otherwise `null` (use plain text).
 */
export function parseMarkdownPipeTables(raw: string): MarkdownPipeSegment[] | null {
  const lines = raw.split(/\r?\n/);
  const segments: MarkdownPipeSegment[] = [];
  const textBuf: string[] = [];
  let i = 0;

  const flushText = (): void => {
    if (textBuf.length === 0) return;
    const content = textBuf.join("\n");
    textBuf.length = 0;
    if (content.trim().length > 0) {
      segments.push({ type: "text", content });
    }
  };

  while (i < lines.length) {
    const line0 = lines[i] ?? "";
    const line1 = lines[i + 1] ?? "";
    const h = splitPipeRow(line0.trim());
    const sep = splitPipeRow(line1.trim());
    if (
      h &&
      h.length >= 2 &&
      sep &&
      sep.length === h.length &&
      isSeparatorCells(sep)
    ) {
      flushText();
      const headers = h;
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const trimmed = lines[i]!.trim();
        if (trimmed === "") {
          i++;
          break;
        }
        const cells = splitPipeRow(trimmed);
        if (!cells || cells.length !== headers.length) {
          break;
        }
        rows.push(cells);
        i++;
      }
      segments.push({ type: "table", headers, rows });
      continue;
    }
    textBuf.push(line0);
    i++;
  }
  flushText();

  if (!segments.some((s) => s.type === "table")) return null;
  return segments;
}
