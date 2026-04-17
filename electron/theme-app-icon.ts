/**
 * Tint the bundled window icon to match UI theme accents (see app.css --accent).
 */

import { nativeImage, type NativeImage } from "electron";

/** Must stay in sync with `body.theme-* { --accent }` in app.css */
export const APP_THEME_ACCENTS: Readonly<Record<string, string>> = {
  dark: "#7c6af7",
  aurora: "#00e5a0",
  ocean: "#38bdf8",
  ember: "#fb923c",
  neon: "#00ffff",
  forest: "#22c55e",
  sunset: "#f97316",
  lavender: "#a78bfa",
  minimal: "#007bff",
  ink: "#d4d4d4",
  prism: "#f472b6",
  hacker: "#ff3b30",
};

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, "").trim();
  if (h.length === 6) {
    const n = parseInt(h, 16);
    if (!Number.isFinite(n)) return { r: 124, g: 106, b: 247 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return { r: 124, g: 106, b: 247 };
}

export function normalizeAppThemeId(raw: unknown): string {
  if (typeof raw !== "string") return "dark";
  let t = raw.trim().toLowerCase();
  if (t.startsWith("theme-")) t = t.slice(6);
  if (APP_THEME_ACCENTS[t]) return t;
  return "dark";
}

const tintedCache = new Map<string, NativeImage>();

export function tintAppIconBase(base: NativeImage, themeId: string): NativeImage | undefined {
  const key = normalizeAppThemeId(themeId);
  const hit = tintedCache.get(key);
  if (hit && !hit.isEmpty()) return hit;

  const hex = APP_THEME_ACCENTS[key] ?? APP_THEME_ACCENTS.dark;
  const { r: ar, g: ag, b: ab } = parseHexRgb(hex);
  const size = base.getSize();
  if (size.width <= 0 || size.height <= 0) return undefined;

  try {
    const buf = Buffer.from(base.toBitmap());
    let w = size.width;
    let h = size.height;
    if (buf.length !== w * h * 4) {
      const px = buf.length / 4;
      const side = Math.round(Math.sqrt(px));
      if (side * side !== px || w !== h) return undefined;
      w = side;
      h = side;
    }

    const isDarwin = process.platform === "darwin";
    for (let i = 0; i < buf.length; i += 4) {
      let r: number;
      let g: number;
      let b: number;
      let a: number;
      if (isDarwin) {
        r = buf[i]!;
        g = buf[i + 1]!;
        b = buf[i + 2]!;
        a = buf[i + 3]!;
      } else {
        b = buf[i]!;
        g = buf[i + 1]!;
        r = buf[i + 2]!;
        a = buf[i + 3]!;
      }
      if (a < 6) continue;
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const nr = Math.min(255, Math.round(ar * luma));
      const ng = Math.min(255, Math.round(ag * luma));
      const nb = Math.min(255, Math.round(ab * luma));
      if (isDarwin) {
        buf[i] = nr;
        buf[i + 1] = ng;
        buf[i + 2] = nb;
      } else {
        buf[i] = nb;
        buf[i + 1] = ng;
        buf[i + 2] = nr;
      }
    }

    const scaleFactor = w / size.width;
    const out = nativeImage.createFromBitmap(buf, {
      width: w,
      height: h,
      scaleFactor: Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1,
    });
    if (out.isEmpty()) return undefined;
    tintedCache.set(key, out);
    return out;
  } catch {
    return undefined;
  }
}
