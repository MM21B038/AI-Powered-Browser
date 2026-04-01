import { getElectronApi } from "../../services/electron-api";

export type BrowserSearchRow = {
  heading: string;
  url: string;
  snippet: string;
};

function decodeHtml(s: string): string {
  const basic = s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
  return basic
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeResultUrl(raw: string): string {
  const href = decodeHtml(raw || "").trim();
  if (!href) return "";
  const withProto = href.startsWith("//") ? `https:${href}` : href;
  try {
    const u = new URL(withProto);
    if (u.hostname.includes("duckduckgo.com") && u.pathname === "/l/") {
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    return withProto;
  } catch {
    return withProto;
  }
}

function parseDdgHtml(html: string, limit: number): BrowserSearchRow[] {
  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const out: BrowserSearchRow[] = [];
      const seen = new Set<string>();
      const candidates = Array.from(doc.querySelectorAll(".result"));
      for (const el of candidates) {
        const a = el.querySelector("a.result__a") as HTMLAnchorElement | null;
        if (!a) continue;
        const url = normalizeResultUrl(a.getAttribute("href") || "");
        if (!url || seen.has(url)) continue;
        const heading = stripTags(a.textContent || "");
        const sn =
          (el.querySelector(".result__snippet")?.textContent || "").trim() ||
          (el.querySelector(".result__body")?.textContent || "").trim();
        const snippet = stripTags(sn);
        out.push({
          heading: heading || "(untitled)",
          url,
          snippet: snippet || "",
        });
        seen.add(url);
        if (out.length >= limit) break;
      }
      if (out.length > 0) return out;
    } catch {
      /* fallback to regex parser below */
    }
  }

  const rows: BrowserSearchRow[] = [];
  const seen = new Set<string>();
  const blockRe = /<div[^>]*class="[^"]*result[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi;
  const blocks = html.match(blockRe) || [];
  for (const block of blocks) {
    const a = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const url = normalizeResultUrl(a[1] || "");
    if (!url || seen.has(url)) continue;
    const heading = stripTags(a[2] || "");
    const snippetPatterns = [
      /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
      /<span[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      /<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];
    let snippet = "";
    for (const p of snippetPatterns) {
      const sm = block.match(p);
      if (sm?.[1]) {
        snippet = stripTags(sm[1]);
        if (snippet) break;
      }
    }
    rows.push({
      heading: heading || "(untitled)",
      url,
      snippet: snippet || "",
    });
    seen.add(url);
    if (rows.length >= limit) break;
  }
  return rows;
}

export async function searchDuckDuckGoWeb(query: string, limit = 5): Promise<BrowserSearchRow[]> {
  const q = (query || "").trim();
  if (!q) return [];
  const safeLimit = Math.max(1, Math.min(5, Math.floor(limit || 5)));
  const api = getElectronApi();
  if (api) {
    const r = await api.ddgFetchHtml(q);
    if (!r.success) throw new Error(r.error || "Failed to fetch");
    return parseDdgHtml(String(r.html || ""), safeLimit);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`DuckDuckGo request failed (${res.status})`);
    const html = await res.text();
    return parseDdgHtml(html, safeLimit);
  } finally {
    clearTimeout(t);
  }
}
