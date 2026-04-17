export type UrlBreadcrumbOptions = {
  /**
   * Max number of breadcrumb segments to show (hostname counts as 1).
   * Additional segments are collapsed into a leading "…" segment.
   */
  maxSegments?: number;
};

function collapseSegments(segments: string[], maxSegments: number): string[] {
  if (!maxSegments || maxSegments < 1) return segments;
  if (segments.length <= maxSegments) return segments;
  const tail = segments.slice(-maxSegments);
  return ["…", ...tail];
}

/**
 * Formats a URL-ish string into a path-only breadcrumb:
 * `example.com > docs > guide`
 *
 * - Drops query + fragment
 * - Uses `>` separators (not `/`)
 */
export function formatUrlPathBreadcrumbs(raw: string, opts?: UrlBreadcrumbOptions): string {
  const input = (raw || "").trim();
  if (!input) return "";

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    try {
      u = new URL(`https://${input}`);
    } catch {
      return input;
    }
  }

  const host = (u.hostname || "").replace(/^www\./i, "") || u.host;
  const segs = u.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });

  const maxSegments = opts?.maxSegments ?? 5;
  const collapsed = collapseSegments(segs, maxSegments);

  const parts = [host, ...collapsed];
  return parts.join(" > ");
}
