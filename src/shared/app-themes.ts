/**
 * Theme IDs: stored in localStorage as `theme`, applied as `body.theme-${id}`.
 * Display: Void = `dark` (see SettingsPanel).
 */

export const APP_THEME_IDS = [
  "dark",
  "ink",
  "aurora",
  "ocean",
  "minimal",
] as const;

export type AppThemeId = (typeof APP_THEME_IDS)[number];

/** Window icon tint accents — must match `body.theme-* { --accent }` in app.css */
export const APP_THEME_ACCENTS: Readonly<Record<AppThemeId, string>> = {
  dark: "#7c6af7",
  ink: "#d4d4d4",
  aurora: "#00e5a0",
  ocean: "#38bdf8",
  minimal: "#2563eb",
};

export function normalizeAppThemeId(raw: unknown): AppThemeId {
  if (typeof raw !== "string") return "dark";
  let t = raw.trim().toLowerCase();
  if (t.startsWith("theme-")) t = t.slice(6);
  if ((APP_THEME_IDS as readonly string[]).includes(t)) return t as AppThemeId;
  return "dark";
}
