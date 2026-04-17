/**
 * A2UI v0.9 constants (message protocol + catalog identifiers).
 *
 * Keep this file dependency-free to avoid cycles with prompt builders.
 */

export const A2UI_V09_VERSION = "v0.9" as const;

/** Official v0.9 basic catalog (JSON Schema / unified catalog). Kept for reference / migration. */
export const A2UI_V09_BASIC_CATALOG_JSON_URL =
  "https://a2ui.org/specification/v0_9/basic_catalog.json";

/**
 * Host-owned v0.9 catalog: filtered subset of upstream basic components + host functions.
 * `createSurface.catalogId` must match this string exactly.
 */
export const A2UI_V09_HOST_CATALOG_JSON_URL =
  "https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json";

