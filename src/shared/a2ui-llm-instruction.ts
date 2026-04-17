/**
 * Generated instruction text for intelligent-workspace prompts (A2UI v0.9).
 */

import { A2UI_V09_HOST_CATALOG_JSON_URL } from "./a2ui-v0_9-constants";
import a2uiV09CatalogSpecMarkdown from "./a2ui-v0_9-catalog-spec.md?raw";

function v09NonNegotiableRulesBlock(): string {
  return `**Non-negotiable rules (v0.9)**
- **One JSON object per line (NDJSON).** No markdown, no code fences needed (fences ok).
- **Every line must include** \`"version":"v0.9"\`.
- **No prefixes / no comments:** Do not output \`Line1:\`, \`[Loading root...]\`, \`//\` comments, or \`/* ... */\` comments.
- **Wire message types (server→client):** \`createSurface\` → then **many** \`updateComponents\` lines → optional \`updateDataModel\` lines (repeat as needed). No \`beginRendering\` in v0.9.
- **\`updateComponents\` — one component per NDJSON line (required in this host):** each line must be a full v0.9 object whose \`updateComponents.components\` array contains **exactly one** component row. Emit **one such line per widget** (each line repeats \`"version":"v0.9"\` and the same \`surfaceId\`). Do **not** batch every component into a single \`updateComponents\` message with a long \`components\` array on one line.
- **\`updateDataModel\`:** use \`{ "surfaceId", "path", "value" }\` only — **not** \`data\`, \`model\`, or arbitrary keys beside \`surfaceId\`. To set several fields, emit **multiple lines** (or \`updates: [{path,value},...]\` if you use that pattern). Initialize numbers/strings your controls bind to.
- **Catalog:** use \`catalogId: "${A2UI_V09_HOST_CATALOG_JSON_URL}"\` exactly (host interactive catalog — not the upstream basic URL).
- **Renderers:** layout/media (\`Text\`, \`Row\`, \`Column\`, …), \`Spacer\`, all interactive inputs (\`TextField\`, \`Slider\`, \`CheckBox\`, \`ChoicePicker\`, \`DateTimeInput\`), \`Button\`, and \`Dropdown\` are **host-rendered** (theme-aligned, shared spacing tokens). JSON props still match the upstream basic catalog schemas (plus \`Spacer\` — see spec).
- **Density:** do not invent margins or CSS in NDJSON; use \`Row\`/\`Column\`, \`Card\`, and \`Spacer\` for alignment.
- **Component row shape:** each row is \`{ "id": "...", "component": "Column", ...props }\`. Props live at the same level (passthrough), not nested under \`component:{...}\` like older wire formats. **Still emit only one row per \`updateComponents\` line** (see above).
- **Layout props (schemas match basic catalog):** \`Column\` / \`Row\` use \`children: ["id1","id2"]\`, plus \`justify\` and \`align\` (not \`distribution\`/ \`alignment\`).
- **Text:** \`variant\` not \`usageHint\` (e.g. \`"h2"\`, \`"body"\`, \`"caption"\`). \`text\` may be a string or \`{ "path": "key" }\`.
- **Button:** uses \`child: "componentId"\` and \`action: { "event": { "name": "...", "context": { ... } } }\` (not \`label\`, not \`action.name\`). Set \`variant\`: \`primary\` for the main call-to-action, \`default\` for secondary actions, \`borderless\` for link-style / tertiary (no custom colors).
- **Icon:** use \`name\` (catalog enum strings like \`"menu"\`, \`"settings"\`, or \`{ "path": "/..." }\`) — **not** \`iconName\`. Do **not** add \`size\` or other undocumented props; the catalog rejects extra keys. Use \`Row\` / \`Column\` / \`Spacer\` for spacing. Optional: \`rounded:\`, \`sharp:\`, \`outlined:\` prefixes on the name string, or \`host:autonomous\` / \`host:agent\` / \`host:browser\` for host SVG icons (see spec).`;
}

/** This host registers extra catalog functions beyond section 4 of the spec above. */
function v09HostExtendedCatalogBlock(): string {
  return `### This host — extra catalog functions (beyond upstream basic catalog list)
These are registered on the **host** v0.9 catalog (\`${A2UI_V09_HOST_CATALOG_JSON_URL}\`): \`toString\`, \`concat\`, \`array_length\`, \`count_where\`, \`sum_by_key\`, \`group_count\`, \`clamp\`, \`format_currency\`, \`format_compact_currency\`, \`format_percent\`, \`moving_average\`, \`sparkline_svg\`, \`math_eval\`, \`series_expr\`.

**Layout & actions:** \`Text\`, \`Image\`, \`Icon\`, \`Row\`, \`Column\`, \`Spacer\`, and other layout/media types, plus all interactive inputs and \`Button\` (use \`variant\`: \`primary\` for main CTAs, \`default\` for secondary, \`borderless\` for link-style), are implemented by the Autonomous Browser renderer; **prop shapes match** the basic catalog (and \`Spacer\` as documented in the spec).

**Charts:** The host catalog includes \`LineChart\`, \`BarChart\`, \`AreaChart\`, \`PieChart\`, \`Histogram\`, and \`DensityPlot\` (themed; no arbitrary colors in NDJSON). For a **tiny** sparkline image only, you may still use \`Image\` with \`url\` from the \`sparkline_svg\` catalog function.

**KPI amounts:** For large currency values in \`Text\`, use \`format_compact_currency\` (short labels like \`$48K\`) instead of \`format_currency\` when full precision strings would overflow or wrap badly; optional \`locale\`: \`en-US\` keeps output stable.

**Reactive formulas:** Use \`math_eval\` (numeric) and \`series_expr\` (array of Y samples) with **mathjs** syntax. Pass each Slider/field binding as a **top-level** key in \`args\` (e.g. \`"a": { "path": "/a" }\`) so updates stay reactive; nest paths only as documented.

**\`series_expr\` (required):** Every \`series_expr\` call **must** include \`expression\`, \`xMin\`, \`xMax\`, and \`steps\` as **top-level** \`args\` keys. That includes **each** \`functionCall\` used for \`LineChart\` / \`AreaChart\` data — e.g. \`categories\` **and** **every** \`series[].values\` row. Do **not** omit the sweep because you already passed coefficients (\`p\`, \`r\`, …): without \`xMin\`/\`xMax\`/\`steps\` the host rejects the call and the chart shows **“No series data”**. Use the **same** \`xMin\` / \`xMax\` / \`steps\` for all series on one chart (and for \`categories\` if you derive labels from the same sweep) so points align. \`xMin\`, \`xMax\`, and \`steps\` may be literals or \`{ "path": "..." }\`.

For \`Text\`, wrap with \`toString\` around \`math_eval\` so \`text\` stays a string. **Slider (v0.9 host):** optional \`decimalPlaces\` (\`0\`–\`3\`) or \`step\` for fractional values; omit for integer steps.

**Charts:** A \`LineChart\` \`series\` binding may resolve to a plain \`number[]\` (e.g. one \`series_expr\`) — the host renders it as one line. For **multiple** named series, each row’s \`values\` \`series_expr\` still needs the full sweep keys above. Give object rows a \`name\` when you need the legend label.

**Button actions:** Besides catalog \`openUrl\` via \`functionCall\`, this app supports host events such as \`host.openUrl\` in \`action.event.name\` (see copy-paste template below).`;
}

function v09WorkedExampleBlock(): string {
  return `### Copy-paste template (v0.9) — one \`updateComponents\` line per component
\`\`\`
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"${A2UI_V09_HOST_CATALOG_JSON_URL}"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Column","children":["bar"],"justify":"start","align":"stretch"}]}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"bar","component":"Row","children":["title","gap","openBtn"],"justify":"start","align":"center"}]}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"title","component":"Text","text":"A2UI v0.9 host test","variant":"h2"}]}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"gap","component":"Spacer","weight":1}]}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"openBtn","component":"Button","child":"openBtnText","variant":"primary","action":{"event":{"name":"host.openUrl","context":{"url":"https://example.com"}}}}]}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"openBtnText","component":"Text","text":"Open example.com","variant":"body"}]}}
\`\`\``;
}

/** Full A2UI v0.9 appendix for the intelligent-workspace system prompt. */
export function generateA2uiV09SystemPromptAppendix(): string {
  return `### A2UI v0.9 — author checklist (preferred)
You MUST output **v0.9** messages.

${v09NonNegotiableRulesBlock()}

---

${a2uiV09CatalogSpecMarkdown.trim()}

---

${v09HostExtendedCatalogBlock()}

${v09WorkedExampleBlock()}`;
}
