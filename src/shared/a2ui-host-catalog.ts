/**
 * Catalog IDs and client–agent agreement for A2UI in this host.
 * See `docs/a2ui-integration-roadmap.md`.
 */

import { A2UI_V08_STANDARD_CATALOG_JSON_URL } from "./a2ui-catalog-constants";

/** Primary catalog: official v0.8 standard catalog (JSON Schema URL). */
export const A2UI_HOST_PRIMARY_CATALOG_ID = A2UI_V08_STANDARD_CATALOG_JSON_URL;

/**
 * Catalog IDs this renderer supports (standard v0.8 only until a custom schema is registered).
 * Use for prompts and future A2A `supportedCatalogIds` / client capabilities.
 */
export function getHostSupportedCatalogIds(): readonly string[] {
  return [A2UI_HOST_PRIMARY_CATALOG_ID];
}

/** Short paragraph for LLM system prompts — “announce support” alignment. */
export function hostCatalogSupportPromptSection(): string {
  const ids = getHostSupportedCatalogIds().join(", ");
  return `### Host client catalog support
This application renders A2UI using the **v0.8 standard catalog** only. **Supported catalog ID(s):** \`${ids}\`.
Emit **only** component keys from that catalog’s schema (see the catalog URL in the checklist). The host applies **renderer-controlled** styling (semantic \`usageHint\`, theme tokens); do not invent arbitrary CSS properties on components.`;
}
