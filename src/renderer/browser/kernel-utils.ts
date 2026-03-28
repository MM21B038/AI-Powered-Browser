export function normalizeHomePageUrl(stored: string | null | undefined): string {
  const fallback = "https://duckduckgo.com";
  const s = (stored || "").trim();
  if (!s) return fallback;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
    return u.href;
  } catch {
    return fallback;
  }
}

export function urlsMatchForTabSwitch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}
