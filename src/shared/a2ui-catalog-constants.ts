/**
 * Shared A2UI catalog identifiers — no LLM prose (avoids import cycles with `a2ui-llm-instruction`).
 */

/** Official v0.8 standard catalog (JSON Schema). */
export const A2UI_V08_STANDARD_CATALOG_JSON_URL =
  "https://a2ui.org/specification/v0_8/standard_catalog_definition.json";

/**
 * Keys under `components[].component` in the standard catalog (plus message-level `styles`).
 * Keep aligned with {@link A2UI_V08_STANDARD_CATALOG_JSON_URL}.
 */
export const A2UI_V08_STANDARD_COMPONENT_KEYS = [
  "AudioPlayer",
  "Button",
  "Card",
  "Checkbox",
  "Column",
  "DateTimeInput",
  "Divider",
  "Icon",
  "Image",
  "List",
  "Modal",
  "MultipleChoice",
  "Row",
  "Slider",
  "Tabs",
  "Text",
  "TextField",
  "Video",
] as const;
