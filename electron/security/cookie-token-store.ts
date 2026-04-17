import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type CookieProfile = {
  cookiesByHost: Record<string, Record<string, string>>;
  tokens: Record<string, string>;
};

type CookieStoreData = {
  profiles: Record<string, CookieProfile>;
};

function filePath(): string {
  return path.join(os.homedir(), ".autonomous-browser", "data", "cookie-token-store.json");
}

async function ensure(): Promise<CookieStoreData> {
  const p = filePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as CookieStoreData;
  } catch {
    const empty: CookieStoreData = { profiles: {} };
    await fs.writeFile(p, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function save(d: CookieStoreData): Promise<void> {
  await fs.writeFile(filePath(), JSON.stringify(d, null, 2), "utf8");
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getProfileMut(d: CookieStoreData, profile: string): CookieProfile {
  if (!d.profiles[profile]) {
    d.profiles[profile] = { cookiesByHost: {}, tokens: {} };
  }
  return d.profiles[profile];
}

export async function setToken(profile: string, name: string, value: string): Promise<void> {
  const d = await ensure();
  const p = getProfileMut(d, profile);
  p.tokens[name] = value;
  await save(d);
}

export async function getTokens(profile: string): Promise<Record<string, string>> {
  const d = await ensure();
  return d.profiles[profile]?.tokens ?? {};
}

export async function setCookie(profile: string, url: string, name: string, value: string): Promise<void> {
  const d = await ensure();
  const p = getProfileMut(d, profile);
  const host = hostFromUrl(url);
  if (!host) return;
  if (!p.cookiesByHost[host]) p.cookiesByHost[host] = {};
  p.cookiesByHost[host][name] = value;
  await save(d);
}

export async function setCookieFromSetCookieHeader(
  profile: string,
  url: string,
  setCookieHeader: string,
): Promise<void> {
  const first = setCookieHeader.split(";")[0] || "";
  const eq = first.indexOf("=");
  if (eq <= 0) return;
  const n = first.slice(0, eq).trim();
  const v = first.slice(eq + 1).trim();
  if (!n) return;
  await setCookie(profile, url, n, v);
}

export async function getCookieHeader(profile: string, url: string): Promise<string> {
  const d = await ensure();
  const p = d.profiles[profile];
  if (!p) return "";
  const host = hostFromUrl(url);
  if (!host) return "";
  const bucket = p.cookiesByHost[host] ?? {};
  const pairs = Object.entries(bucket).map(([k, v]) => `${k}=${v}`);
  return pairs.join("; ");
}

export function extractCsrfTokenFromHtml(html: string): { name: string; value: string } | null {
  const patterns: RegExp[] = [
    /<meta[^>]+name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
    /<input[^>]+name=["']_csrf["'][^>]*value=["']([^"']+)["']/i,
    /<input[^>]+name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return { name: "x-csrf-token", value: m[1] };
  }
  return null;
}
