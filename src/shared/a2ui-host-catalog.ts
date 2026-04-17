/**
 * Catalog IDs and client–agent agreement for A2UI in this host.
 * See `docs/a2ui-integration-roadmap.md`.
 */

import {
  A2UI_V09_BASIC_CATALOG_JSON_URL,
  A2UI_V09_HOST_CATALOG_JSON_URL,
} from "./a2ui-v0_9-constants";

/** Primary catalog: host interactive catalog (JSON Schema URL). */
export const A2UI_HOST_PRIMARY_CATALOG_ID = A2UI_V09_HOST_CATALOG_JSON_URL;

/**
 * Catalog IDs this renderer supports (host v0.9 + upstream basic for reference agents).
 * Use for prompts and A2A `supportedCatalogIds` / client capabilities.
 */
export function getHostSupportedCatalogIds(): readonly string[] {
  return [A2UI_V09_HOST_CATALOG_JSON_URL, A2UI_V09_BASIC_CATALOG_JSON_URL];
}

/** Short paragraph for LLM system prompts — “announce support” alignment. */
export function hostCatalogSupportPromptSection(): string {
  const ids = getHostSupportedCatalogIds().join(", ");
  return `### Host client catalog support
This application renders **A2UI v0.9** using the host catalog and basic catalog. **Supported catalog ID(s):** \`${ids}\`.
Emit **only** component keys from those schemas (see URLs in the v0.9 checklist). The host applies renderer-controlled styling and theme tokens; do not invent arbitrary CSS in NDJSON.`;
}
