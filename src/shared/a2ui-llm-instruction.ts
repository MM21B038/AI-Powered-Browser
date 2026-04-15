/**
 * Generated instruction text for intelligent-workspace prompts: v0.8 catalog pointers,
 * allowlisted component keys, and non-negotiable wire rules (TypeScript, not Python).
 */

import {
  A2UI_V08_STANDARD_CATALOG_JSON_URL,
  A2UI_V08_STANDARD_COMPONENT_KEYS,
} from "./a2ui-catalog-constants";
import { hostCatalogPolicyPromptSupplement } from "./a2ui-host-catalog-policy";
import { hostCatalogSupportPromptSection } from "./a2ui-host-catalog";
import { hostA2uiSecurityPromptOneLiner } from "./a2ui-host-security";
import a2uiV09CatalogSpecMarkdown from "./a2ui-v0_9-catalog-spec.md?raw";

export { A2UI_V08_STANDARD_CATALOG_JSON_URL, A2UI_V08_STANDARD_COMPONENT_KEYS };

function catalogSubsetAppendix(): string {
  const s = hostCatalogPolicyPromptSupplement();
  return s ? `${s}\n\n` : "";
}

function catalogAndKeysBlock(): string {
  const keys = [...A2UI_V08_STANDARD_COMPONENT_KEYS].sort().join(", ");
  return `**Catalog (v0.8):** ${A2UI_V08_STANDARD_CATALOG_JSON_URL}
**Upstream spec (same wire as \`@a2ui/web_core\`):** [google/A2UI \`specification/\`](https://github.com/google/A2UI/tree/main/specification) — agent samples may use Python \`A2uiSchemaManager\`-style tooling; this host validates with the **TypeScript/Zod** stack, not Python at runtime.
**Component keys (allowlist):** ${keys}. Use only these keys under \`component\` (plus message-level \`styles\` where applicable). The catalog JSON defines required fields and enums — invalid shortcuts are rejected.`;
}

/** Allowed \`Text.usageHint\` values — must match \`@a2ui/web_core\` TextSchema. */
export const A2UI_V08_TEXT_USAGE_HINTS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "caption",
  "body",
] as const;

function textUsageHintAndChildrenTemplateBlock(): string {
  const allowed = A2UI_V08_TEXT_USAGE_HINTS.join('`, `');
  return `### \`Text.usageHint\` — **closed enum** (not free text)
Only these strings are valid: \`${allowed}\`.

| Do **not** use | Use instead (semantic) |
|----------------|-------------------------|
| \`title\`, \`header\`, \`heading\` | \`h2\` or \`h3\` for section titles |
| \`subtitle\`, \`label\`, \`fine\` | \`caption\` |
| \`button\`, \`btn\`, \`cta\` | \`body\` (text **inside** a \`Button\`’s child \`Text\` has no separate “button” style — there is **no** \`usageHint: "button"\`) |
| paragraph / body copy | \`body\` |

Omit \`usageHint\` if unsure (optional field).

### \`Row\` / \`Column\` / \`List\` — \`children.template.dataBinding\` is a **string**
Dynamic lists use \`children: { "template": { "componentId": "<id>", "dataBinding": "<path>" } }\` where **\`dataBinding\` must be a JSON string** (data-model path), e.g. \`"/items"\` or \`"todos"\`.

- **Wrong:** \`"dataBinding": { "path": "/items" }\` — object is invalid; the schema expects a **string**.
- **Right:** \`"dataBinding": "/items"\` or \`"dataBinding": "items"\`.
- **Easiest:** prefer \`children: { "explicitList": ["id1","id2",…] }\` for static UIs unless you truly need template-driven lists.`;
}

function rejectedWireShapesBlock(): string {
  return `### Rejected wire shapes (common LLM mistakes — validation **fails**)
These look like React/GraphQL/other UIs — **v0.8 does not use them:**
- **No \`"type": "Column"\` / \`"type": "TextField"\`:** There is no string \`type\` field. Put **exactly one** catalog key **as the property name**: \`"component": { "Column": { "children": { "explicitList": ["a","b"] }, "distribution": "start", "alignment": "stretch" } } }\`.
- **No \`parentId\`:** Trees are **not** linked by parents. Parents reference children by **id** in \`children.explicitList\`, \`Card.child\`, \`Button.child\`, \`Row.children\`, etc. Every component is a **flat** entry in \`surfaceUpdate.components\` with its own \`id\`.
- **\`Card\`:** Exactly \`{ "child": "<component-id>" }\` — **required** string. Do **not** use \`content\`, \`children\`, or leave \`Card\` empty (validation error: \`child\` Required).
- **No \`valueBinding\` / \`checkedBinding\` / \`value\` on \`Text\`:** Use \`Text.text: { "literalString": "..." }\` or \`{ "path": "keyInDataModel" }\`. For \`TextField\`, bind with \`text: { "path": "draftKey" }\`.
- **No fake \`valueMap\` objects:** \`dataModelUpdate.contents\` entries cannot use \`"valueMap": { "a": 1, "b": 2 }\`. See **\`valueMap\` array** rules below.
- **\`Checkbox\`:** JSON key \`"Checkbox"\` (not \`"type"\`) with \`label\` (StringValue) and \`value: { "path": "…" }\` or \`{ "literalBoolean": … }\` — not \`checkedBinding\`.
- **\`Button\`:** Must have \`child\` (id of a \`Text\` node) and \`action: { "name": "string" }\`. Optional \`primary\`. Never put a raw label string where \`child\` goes.
- **\`dataModelUpdate\`:** Must include \`surfaceId\`, **\`path\`** (required string, often \`"/"\`), and \`contents\` — not \`contents\` alone at the top level without \`path\`.

### Minimal valid three-line pattern (copy structure)
Use the **same** \`surfaceId\` on all three lines. Either **bare lines** or **one** \` \`\`\`jsonl \` … \` \`\`\` \` fence** wrapping the same three lines (no commentary inside the fence).
1. \`{"surfaceUpdate":{"surfaceId":"todo","components":[…]}}\` — one **flat** array; each item \`{ "id", "component": { "Column"|"Text"|… } }\`.
2. \`{"dataModelUpdate":{"surfaceId":"todo","path":"/","contents":[…]}}\`
3. \`{"beginRendering":{"surfaceId":"todo","root":"<id of root layout component>"}}\``;
}

function dataModelAndWorkedExamplesBlock(): string {
  return `### \`dataModelUpdate.contents\` — \`valueMap\` is an **array**, never a JSON object
The Zod schema matches \`@a2ui/web_core\`: each \`contents\` row has \`key\` plus **exactly one** of \`valueString\` | \`valueNumber\` | \`valueBoolean\` | \`valueMap\`.

- **Wrong (will 400 / validation error):** \`"valueMap": { "title": "Buy", "done": false }\` — **object** is invalid; the schema expects **array**.
- **Right (nested map):** \`valueMap\` is an **array of rows**, each with \`key\` + one scalar:
  \`"valueMap": [{"key":"title","valueString":"Buy milk"},{"key":"done","valueBoolean":false}]\`
- **Easiest for todo apps — flat keys (recommended):** avoid nested \`valueMap\` entirely; use one row per scalar, e.g. \`{"key":"todo1_title","valueString":"Buy milk"}\`, \`{"key":"todo1_done","valueBoolean":false}\`, then bind \`Text\` / \`Checkbox\` with \`"path":"todo1_title"\` and \`"path":"todo1_done"\` (paths are opaque string keys — use flat names without dots if that is simpler).

### \`Row\` / \`Column\` / \`List\` — \`children\` is required
Each must include \`children: { "explicitList": ["childId", ...] }\` **or** \`children: { "template": { "componentId", "dataBinding" } }\`. **Never** omit \`children\` or emit an empty \`List\` — you will get “Required” errors (e.g. missing \`List.children\`). See **\`dataBinding\` string** rules in the \`Text.usageHint\` section above.

### Component key spelling under \`component\`
Use **\`Checkbox\`** (one capital **C**, rest lowercase) — the wire name in \`@a2ui/web_core\`. Avoid \`CheckBox\` / random casing unless you know the host normalizes it.

### Copy-paste templates (valid minimal NDJSON)

**A) Smallest valid panel (3 lines, same \`surfaceId\`) — line 3 is mandatory**
\`\`\`
{"surfaceUpdate":{"surfaceId":"demo","components":[{"id":"root","component":{"Column":{"children":{"explicitList":["t1"]},"distribution":"start","alignment":"stretch"}}}},{"id":"t1","component":{"Text":{"text":{"literalString":"Hello"},"usageHint":"body"}}}]}}
{"dataModelUpdate":{"surfaceId":"demo","path":"/","contents":[]}}
{"beginRendering":{"surfaceId":"demo","root":"root"}}
\`\`\`

**B) One \`dataModelUpdate\` row using nested \`valueMap\` (array form)**
\`\`\`
{"dataModelUpdate":{"surfaceId":"demo","path":"/","contents":[{"key":"user","valueMap":[{"key":"name","valueString":"Ada"},{"key":"score","valueNumber":42}]}]}}
\`\`\`
(Still pair with \`surfaceUpdate\` + \`beginRendering\` on other lines in the same message.)

**C) Flat todo-style keys (simplest for models)**
\`\`\`
{"key":"newTodo","valueString":""}
{"key":"todo1_title","valueString":"Buy milk"}
{"key":"todo1_done","valueBoolean":false}
\`\`\`
Put these **inside** \`contents\` in the \`dataModelUpdate\` line; bind fields with \`"path":"todo1_title"\` etc.`;
}

function nonNegotiableRulesBlock(): string {
  return `**Non-negotiable rules**
- **Wire:** One root key per line: \`surfaceUpdate\` | \`dataModelUpdate\` | \`beginRendering\` | \`deleteSurface\`; repeat \`surfaceId\` on **every** line (same string, e.g. \`"main"\`); \`beginRendering\` **last** with \`root\` = the **id** of an existing component in that surface’s tree. **Never skip line 3** — without \`beginRendering\`, the tree does not paint.
- **\`dataModelUpdate\`:** Must include \`surfaceId\`, **\`path\`** (string, usually \`"/"\`), and \`contents\` — each row \`key\` + one value field as below.
- **\`dataModelUpdate.contents\`:** Each row is \`{ "key", … }\` with exactly one of \`valueString\` / \`valueNumber\` / \`valueBoolean\` / \`valueMap\`. **\`valueString\` must be a plain JSON string** (e.g. \`"hello"\`), not a \`StringValue\` object — those shapes are for \`Text\` / labels inside \`component\`, not the data model wire format. **If you use \`valueMap\`, it must be a JSON array** of \`{ key, value* }\` rows — **not** a single JSON object of key/value pairs.
- **\`TextField.textFieldType\`:** Must be a **plain JSON string** enum (\`"shortText"\`, \`"longText"\`, …), **not** \`{ "literalString": "shortText" }\` (that shape is for other fields).
- **\`Button.action.name\`:** Must be a **string**. It must **not** equal any **component \`id\`** on the same surface (runtime resolves matching strings as child refs → circular dependency). Use distinct names (e.g. \`id\`: \`btnClear\`, \`action.name\`: \`clearTodos\`).
- **\`Button.child\`:** Must be the **id** of a component (e.g. a \`Text\` node), not a raw label string.
- **Host-reserved action names** (e.g. \`host.openUrl\`, \`host.patch.v1\`) and **\`a2uiLocalPatch\`** behave as documented in the base prompt — use only when you intend host-side behavior.
`;
}

function uiQualityBlock(): string {
  return `**UI quality (make it look like a real panel)**
- Prefer a **Card-based layout**: \`Column(root)\` → \`Card\` → inner \`Column\`. Put the title + controls inside the Card.
- Use semantic typography: title \`Text.usageHint: "h3"\` (or \`"h2"\`), supporting text \`"body"\`, small helper text \`"caption"\`.
- Use a clear information hierarchy: title → primary control(s) → readout/summary → optional hint.
- Bind interactive controls to the data model and **initialize** the keys in \`dataModelUpdate\`.

**Interactive controls that must “just work” in this host**
- **Two-way binding (core rule):** \`TextField\`, \`CheckBox\`/\`CheckBox\`, \`Slider\`, \`MultipleChoice\`, \`DateTimeInput\` update the **client-side data model immediately** when the user interacts. To make a control reactive:
  - bind it with \`{ "path": "someKey" }\`
  - initialize that key in \`dataModelUpdate\`
  - bind any readout \`Text\` to the **same** path (it updates live).
- **Do not rely on Button actions for reactivity:** Buttons are for “commands” (add/delete/save). Inputs/sliders/checkboxes should work without any action round-trip.
- **Slider (v0.8 React renderer):** you must set **\`minValue\` and \`maxValue\`** (not just \`min\`/\`max\`). If \`maxValue\` is omitted it defaults to \`0\` → the slider cannot move.
- **Slider value:** set \`value: { "path": "sliderValue" }\` (Number binding) and initialize \`{"key":"sliderValue","valueNumber":0}\` (or another number).
- **Readout:** show the numeric value with \`Text.text: { "path": "sliderValue" }\` (large usageHint like \`"h1"\`/\`"h2"\`).
`;
}

function deliveryBlock(includeOpenFenceStreamingNote: boolean): string {
  const fence = "` ```json` / ` ```jsonl` ";
  const openFence = includeOpenFenceStreamingNote
    ? ` In this host, **open** ${fence}blocks (no closing line yet) are still parsed as NDJSON incrementally while the message streams.`
    : "";
  return `**Delivery (canonical):** Put **NDJSON in your assistant markdown** — there is no separate A2UI MCP tool.
- **Never use HTML for in-chat UI:** Do **not** build interactive panels with \` \`\`\`html \`, \` \`\`\`css \`, or raw HTML/CSS “mockups” — those stay inert code blocks and **do not** create the A2UI surface. The in-chat renderer only consumes **v0.8 A2UI NDJSON** (bare lines or ${fence}fences). Use HTML fences only when showing **code examples**, not as the deliverable UI.
- **Must be visible NDJSON:** Your answer **must** contain the tree as either (a) **bare** lines (each line one complete JSON object), or (b) a **\` \`\`\`jsonl \`** (or \` \`\`\`json\`) **fenced** block whose body is NDJSON. Do **not** output only pseudo-code labels like \`surfaceUpdate:\` with partial braces, and do **not** hide the only copy inside unstructured prose — the host parser does not execute free-form outlines.
- **Best for token streaming:** **Bare** lines: one JSON object per line (no fence), in order. Each complete line is validated and merged as soon as it parses.
- **Fenced blocks:** You may wrap NDJSON in ${fence}or a generic \` \`\`\` \` fence.${openFence} Prefer bare lines if you want the simplest incremental behavior.
- **Large trees:** Keep each line **valid end-to-end**; avoid truncated braces mid-stream when possible.`;
}

/** Full A2UI v0.8 appendix for the intelligent-workspace system prompt. */
export function generateA2uiSystemPromptAppendix(): string {
  return `### A2UI v0.8 — author checklist (concise)
${catalogAndKeysBlock()}

${hostCatalogSupportPromptSection()}

${catalogSubsetAppendix()}${hostA2uiSecurityPromptOneLiner()}

${deliveryBlock(true)}

${uiQualityBlock()}

${rejectedWireShapesBlock()}

${textUsageHintAndChildrenTemplateBlock()}

${dataModelAndWorkedExamplesBlock()}

${nonNegotiableRulesBlock()}
`;
}

function v09NonNegotiableRulesBlock(): string {
  return `**Non-negotiable rules (v0.9)**
- **One JSON object per line (NDJSON).** No markdown, no code fences needed (fences ok).
- **Every line must include** \`"version":"v0.9"\`.
- **No prefixes / no comments:** Do not output \`Line1:\`, \`[Loading root...]\`, \`//\` comments, or \`/* ... */\` comments.
- **Wire message types (server→client):** \`createSurface\` → \`updateComponents\` → optional \`updateDataModel\` (repeat \`update* \` as needed). No \`beginRendering\` in v0.9.
- **\`updateDataModel\`:** use \`{ "surfaceId", "path", "value" }\` only — **not** \`data\`, \`model\`, or arbitrary keys beside \`surfaceId\`. To set several fields, emit **multiple lines** (or \`updates: [{path,value},...]\` if you use that pattern). Initialize numbers/strings your controls bind to.
- **Catalog:** use \`catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json"\` unless told otherwise.
- **\`updateComponents.components\`:** each component row is \`{ "id": "...", "component": "Column", ...props }\`. Component props live at the same level (passthrough), not nested under \`component:{...}\` like v0.8.
- **Layout props (basic catalog):** \`Column\` / \`Row\` use \`children: ["id1","id2"]\`, plus \`justify\` and \`align\` (not \`distribution\`/ \`alignment\`).
- **Text:** \`variant\` not \`usageHint\` (e.g. \`"h2"\`, \`"body"\`, \`"caption"\`). \`text\` may be a string or \`{ "path": "key" }\`.
- **Button:** uses \`child: "componentId"\` and \`action: { "event": { "name": "...", "context": { ... } } }\` (not \`label\`, not \`action.name\`).`;
}

/** This host registers extra catalog functions beyond section 4 of the spec above. */
function v09HostExtendedCatalogBlock(): string {
  return `### This host — extra catalog functions (not in basic_catalog.json list)
The renderer also registers these **expression** helpers: \`toString\`, \`concat\`, \`array_length\`, \`count_where\`, \`sum_by_key\`, \`group_count\`, \`clamp\`, \`format_currency\`, \`format_percent\`, \`moving_average\`, \`sparkline_svg\`.

**Charts:** There is no \`LineChart\` component. Use \`Image\` with \`url\` from \`sparkline_svg\` (data URL) when you need a sparkline.

**Button actions:** Besides catalog \`openUrl\` via \`functionCall\`, this app supports host events such as \`host.openUrl\` in \`action.event.name\` (see copy-paste template below).`;
}

function v09WorkedExampleBlock(): string {
  return `### Copy-paste template (v0.9) — minimal panel + host.openUrl button
\`\`\`
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://a2ui.org/specification/v0_9/basic_catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["title","openBtn"],"justify":"start","align":"stretch"},
  {"id":"title","component":"Text","text":"A2UI v0.9 host.openUrl test","variant":"h2"},
  {"id":"openBtn","component":"Button","child":"openBtnText","variant":"primary","action":{"event":{"name":"host.openUrl","context":{"url":"https://example.com"}}}},
  {"id":"openBtnText","component":"Text","text":"Open example.com","variant":"body"}
]}}
\`\`\``;
}

/** Full A2UI v0.9 appendix for the intelligent-workspace system prompt. */
export function generateA2uiV09SystemPromptAppendix(): string {
  return `### A2UI v0.9 — author checklist (preferred)
You MUST output **v0.9** messages (not v0.8).

${v09NonNegotiableRulesBlock()}

---

${a2uiV09CatalogSpecMarkdown.trim()}

---

${v09HostExtendedCatalogBlock()}

${v09WorkedExampleBlock()}`;
}
