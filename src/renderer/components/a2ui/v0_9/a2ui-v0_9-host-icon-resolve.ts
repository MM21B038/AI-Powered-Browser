/**
 * Parses A2UI v0.9 `Icon` name strings for Material style prefixes and host-only extras.
 * Documented in `src/shared/a2ui-v0_9-catalog-spec.md` (Icon section).
 */

export type A2uiV09IconMaterialStyle = "outlined" | "rounded" | "sharp";

const HOST_PREFIX = "host:";

const STYLE_PREFIXES: ReadonlyArray<{
  prefix: string;
  style: A2uiV09IconMaterialStyle;
}> = [
  { prefix: "rounded:", style: "rounded" },
  { prefix: "sharp:", style: "sharp" },
  { prefix: "outlined:", style: "outlined" },
];

/** Whitelist keys allowed after `host:` (lowercase). */
export const A2UI_V09_HOST_ICON_EXTRA_KEYS = [
  "autonomous",
  "agent",
  "browser",
] as const;

export type A2uiV09HostIconExtraKey = (typeof A2UI_V09_HOST_ICON_EXTRA_KEYS)[number];

export type ResolvedA2uiV09Icon =
  | { kind: "host"; key: A2uiV09HostIconExtraKey }
  | { kind: "material"; ligature: string; style: A2uiV09IconMaterialStyle };

export function isA2uiV09HostIconExtraKey(key: string): key is A2uiV09HostIconExtraKey {
  return (A2UI_V09_HOST_ICON_EXTRA_KEYS as readonly string[]).includes(key);
}

/**
 * Catalog enums use camelCase (`arrowBack`); Material Symbols ligatures use snake_case (`arrow_back`).
 * Pass-through when already snake_case or single token.
 */
export function formatMaterialSymbolsLigature(ligature: string): string {
  const t = ligature.trim();
  if (!t) return t;
  if (t.includes("_") || !/[a-z][A-Z]/.test(t)) return t;
  return t.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function resolveA2uiV09IconName(raw: string): ResolvedA2uiV09Icon {
  const t = raw.trim();
  if (!t) return { kind: "material", ligature: "help", style: "outlined" };

  if (t.startsWith(HOST_PREFIX)) {
    const key = t.slice(HOST_PREFIX.length).trim().toLowerCase();
    if (key && isA2uiV09HostIconExtraKey(key)) return { kind: "host", key };
    return { kind: "material", ligature: "help", style: "outlined" };
  }

  for (const { prefix, style } of STYLE_PREFIXES) {
    if (t.startsWith(prefix)) {
      const lig = t.slice(prefix.length).trim();
      const base = lig || "help";
      return {
        kind: "material",
        ligature: formatMaterialSymbolsLigature(base),
        style,
      };
    }
  }

  return { kind: "material", ligature: formatMaterialSymbolsLigature(t), style: "outlined" };
}
