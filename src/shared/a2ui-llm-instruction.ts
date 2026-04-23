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

/**
 * Canonical patterns for Plot3D, series_surface, mesh_* catalog, and common LLM mistakes.
 * Keep ASCII-only inside this template to avoid TS parse issues.
 */
function v09Plot3dSurfacesMeshesBlock(): string {
  return `### Plot3D, surfaces, meshes, and calculus wiring (critical)

**1) Heightfield z = f(x,y) (normal 3D equation plot)**
- Catalog **\`series_surface\`**: required top-level \`args\` keys \`expression\`, \`xMin\`, \`xMax\`, \`yMin\`, \`yMax\`; optional \`xSteps\`, \`ySteps\`. Expression uses variables \`x\` and \`y\` (mathjs). Extra coefficients are **top-level** \`args\` keys (number or \`{ "path": "/..." }\`).
- Returns \`{ x: number[], y: number[], z: number[][] }\` (grid: \`z\` rows follow \`y\`, columns follow \`x\`).
- **Legacy Plot3D:** \`"kind": "surface"\` (default), bind \`surface\` to a \`functionCall\` for \`series_surface\` or to \`{ "path": "/surface" }\` after materializing in \`updateDataModel\`.
- **Multi-trace:** one \`traces\` row with \`"traceType": "surface"\` and the same \`x\`, \`y\`, \`z\` shape.

**2) Solid primitives (\`mesh_sphere\`, \`mesh_cylinder\`, \`mesh_cone\`, \`mesh_torus\`, \`mesh_cuboid\`, \`mesh_box\`, \`mesh_merge\`)**
- Each function returns **one object**: \`{ "x": [...], "y": [...], "z": [...], "i": [...], "j": [...], "k": [...] }\` for Plotly mesh3d.
- **Correct mesh trace (recommended):** one catalog call per solid, bound on **\`x\`** or **\`mesh\`**, with \`"returnType": "object"\` on the \`functionCall\`. Example shape: \`{"traceType":"mesh","name":"Cone","x":{"call":"mesh_cone","args":{"height":4,"radius":1.5,"cz":-2},"returnType":"object"}}\`. The host accepts the **full** mesh on \`x\` or \`mesh\`; you do **not** need separate \`y\`…\`k\` keys in that case.
- **Split-field pattern (advanced):** repeat the same \`functionCall\` on \`x\`, \`y\`, \`z\`, \`i\`, \`j\`, \`k\`, each with an extra string property \`"path":"x"\` through \`"path":"k"\` on the **same object as** \`call\`/\`args\` (these pick fields from the resolved object; they are **not** data-model paths, so **never** use a leading slash there). Wrong: only \`x\` with a call and no \`y\`…\`k\` unless you use the full-mesh-on-\`x\` pattern above.

**3) Argument names the schema accepts (avoid silent empty plots)**
- **\`mesh_sphere\`:** \`radius\` **or** \`r\`; optional \`cx\`, \`cy\`, \`cz\` (default 0); \`segments\` or \`widthSegments\` / \`heightSegments\`.
- **\`mesh_cylinder\`:** \`radius\` **or** \`r\`; \`height\` **or** \`h\`; optional \`cx\`, \`cy\`, \`cz\`; \`radialSegments\` or \`segments\` (or \`radial\`); optional \`heightSegments\`; optional \`caps\` (false = open tube).
- **\`mesh_cone\`:** \`height\` **or** \`h\`; \`baseRadius\` **or** \`radius\` **or** \`r\`; optional centers; \`radialSegments\` or \`segments\`.
- **\`mesh_torus\`:** \`majorRadius\` / \`minorRadius\` **or** \`R\` / \`r\`; optional centers; optional \`uSegments\`, \`vSegments\`.
- **\`mesh_cuboid\`:** required \`hx\`, \`hy\`, \`hz\` (half-extents); optional \`cx\`, \`cy\`, \`cz\`.
- **\`mesh_box\`:** required all of \`x0\`, \`y0\`, \`z0\`, \`x1\`, \`y1\`, \`z1\` (axis-aligned corners).
- **\`mesh_merge\`:** \`a\` and \`b\` are each full mesh objects.

**4) Parametric surfaces (\`mesh_parametric_uv\`)**
- Required: \`xExpression\`, \`yExpression\`, \`zExpression\`, \`uMin\`, \`uMax\`, \`vMin\`, \`vMax\`, optional \`uSteps\`, \`vSteps\`. Sweep variables are **\`u\`** and **\`v\`** only. Other symbols as top-level \`args\` (same reactivity pattern as \`series_surface\`).

**5) Plot3D \`traces\` and legacy single-trace mode**
- **Legacy (no \`traces\`):** \`kind\` \`"surface"\` (default) or \`"scatter"\`; bind \`surface\` to a \`series_surface\` \`functionCall\` (or \`{ "path": "/surface" }\` after \`updateDataModel\`) or bind \`points\` for scatter.
- \`traces\` is either a JSON **array** of trace objects or \`{ "path": "/traces" }\` bound to a model array.
- Each trace: \`traceType\` \`"surface"\` | \`"scatter"\` | \`"mesh"\`. Optional \`name\`, \`opacity\`; scatter optional \`markerSize\`.
- **Scatter:** \`points\` as \`[{ "x", "y", "z", "label"? }]\` or path.
- When \`traces\` resolves non-empty, it **replaces** legacy \`kind\` / \`surface\` / \`points\` for that plot.
- Set \`heightPx\` on \`Plot3D\` for layout (avoid tiny default height).
- **\`axisRangeMode\`:** \`"symmetric"\` uses the union of all trace coordinates per axis (good for centered scenes).
- **Legend:** set non-empty \`name\` on **more than one** trace to enable the legend.

**6) Reactivity and \`/traces\`**
- If you store a **literal** mesh array under \`/traces\` in \`updateDataModel\`, changing sliders **does not** recompute that array automatically. For live updates, either (a) put \`functionCall\` bindings **inline** in \`updateComponents\` so each trace depends on paths, or (b) re-emit \`updateDataModel\` for \`/traces\` when inputs change (e.g. from a button action), or (c) bind each mesh \`functionCall\` directly in the plot without centralizing in \`/traces\`.

**7) 2D math charts (quadrants)**
- Default \`xMode\` is \`"category"\` (label strings, or sample index \`0..n-1\` if \`categories\` is omitted). For plots over real \`x\` (positive and negative), set \`xMode\` to \`"number"\`.
- \`LineChart\` / \`AreaChart\` with \`xMode\` \`"number"\`: bind \`xValues\` to the same sweep as each \`series_expr\` (identical \`xMin\`, \`xMax\`, \`steps\` across series; same array length as each series \`values\`). Use \`includeZeroOnY\`: false when negative \`y\` must stay visible.

**8) Single-choice controls**
- **\`ChoicePicker\`:** \`value\` for one chip is a **string** (e.g. \`"cone"\`), not a JSON array of one string, unless your pipeline explicitly stores array values.

**9) mathjs reminders**
- Use \`PI\` (or lowercase per expression style), \`sin\`, \`cos\`, \`exp\`, \`^\` for powers; variable names in \`expression\` must match top-level \`args\` keys.`;
}

/** This host registers extra catalog functions beyond section 4 of the spec above. */
function v09HostExtendedCatalogBlock(): string {
  return `### This host — extra catalog functions (beyond upstream basic catalog list)
These are registered on the **host** v0.9 catalog (\`${A2UI_V09_HOST_CATALOG_JSON_URL}\`): \`toString\`, \`concat\`, \`array_length\`, \`count_where\`, \`sum_by_key\`, \`group_count\`, \`clamp\`, \`format_currency\`, \`format_compact_currency\`, \`format_percent\`, \`moving_average\`, \`sparkline_svg\`, \`math_eval\`, \`series_expr\`, **\`diff_numeric\`**, **\`partial_diff_numeric\`**, **\`integrate_numeric\`**, **\`series_surface\`**, **\`mesh_sphere\`**, **\`mesh_box\`**, **\`mesh_cuboid\`**, **\`mesh_cylinder\`**, **\`mesh_cone\`**, **\`mesh_torus\`**, **\`mesh_merge\`**, **\`mesh_parametric_uv\`**.

**Layout & actions:** \`Text\`, \`Image\`, \`Icon\`, \`Row\`, \`Column\`, \`Spacer\`, and other layout/media types, plus all interactive inputs and \`Button\` (use \`variant\`: \`primary\` for main CTAs, \`default\` for secondary, \`borderless\` for link-style), are implemented by the Autonomous Browser renderer; **prop shapes match** the basic catalog (and \`Spacer\` as documented in the spec).

**Charts:** The host catalog includes \`LineChart\`, \`BarChart\`, \`AreaChart\`, \`PieChart\`, \`Histogram\`, \`DensityPlot\`, **\`Plot3D\`** (WebGL: multiple surfaces, scatter, and **mesh3d** solids via \`traces\`), and **\`ModelViewer3D\`** (GLB/GLTF viewer + optional download links). Themed; no arbitrary colors in NDJSON. For a **tiny** sparkline image only, you may still use \`Image\` with \`url\` from the \`sparkline_svg\` catalog function.

**KPI amounts:** For large currency values in \`Text\`, use \`format_compact_currency\` (short labels like \`$48K\`) instead of \`format_currency\` when full precision strings would overflow or wrap badly; optional \`locale\`: \`en-US\` keeps output stable.

**Reactive formulas:** Use \`math_eval\` (numeric) and \`series_expr\` (array of Y samples) with **mathjs** syntax. Pass each Slider/field binding as a **top-level** key in \`args\` (e.g. \`"a": { "path": "/a" }\`) so updates stay reactive; nest paths only as documented.

**Numeric calculus (same reactive pattern as \`math_eval\`):** \`diff_numeric\` needs \`expression\`, \`x\`, optional \`h\`, plus any extra variables as **top-level** \`args\` keys (literals or \`{ "path": "..." }\`). **\`partial_diff_numeric\`** needs \`expression\`, \`wrt\` (\`"x"\` | \`"y"\` | \`"z"\`), optional \`h\`, plus **top-level** coordinates for every symbol used in the expression (e.g. \`x\`, \`y\` for ∂f/∂x at a fixed \`y\`). \`integrate_numeric\` needs \`expression\`, \`xMin\`, \`xMax\`, optional \`steps\`, plus extra vars the same way. \`integrate_numeric\` integrates over **\`x\`** (mathjs).

${v09Plot3dSurfacesMeshesBlock()}

**Mesh index semantics:** Parallel \`i\`, \`j\`, \`k\` index into the \`x\`/\`y\`/\`z\` vertex arrays for each triangle corner (Plotly mesh3d).

**Hollow or shell looks (mesh):** use two \`traceType: "mesh"\` traces (outer and inner radii) or a tube plus caps as needed; **torus** already has a hole. For authored mesh **files** (GLB), prefer **\`ModelViewer3D\`**.

**\`ModelViewer3D\`:** \`source\` is a **GLB or GLTF** URL (\`https://...\`), a \`data:...\` URL, \`{ "artifactId": "...", "mime": "model/gltf-binary", "name": "model.glb" }\` when the user ran Python sandbox and files were returned with \`artifactId\`, or \`{ "path": "/modelSrc" }\`. Optional \`files\`: \`[{ "label": "Download", "source": "https://..." | { artifactId } }]\` for extra downloads. \`@google/model-viewer\` does **not** reliably display arbitrary OBJ/STL; prefer GLB/GLTF for the viewer and expose OBJ/STL only under \`files\` if needed.

**\`series_expr\` (required):** Every \`series_expr\` call **must** include \`expression\`, \`xMin\`, \`xMax\`, and \`steps\` as **top-level** \`args\` keys. That includes **each** \`functionCall\` used for \`LineChart\` / \`AreaChart\` data — e.g. \`categories\` **and** **every** \`series[].values\` row. Do **not** omit the sweep because you already passed coefficients (\`p\`, \`r\`, …): without \`xMin\`/\`xMax\`/\`steps\` the host rejects the call and the chart shows **“No series data”**. Use the **same** \`xMin\` / \`xMax\` / \`steps\` for all series on one chart (and for \`categories\` if you derive labels from the same sweep) so points align. \`xMin\`, \`xMax\`, and \`steps\` may be literals or \`{ "path": "..." }\`.

For \`Text\`, wrap with \`toString\` around \`math_eval\` so \`text\` stays a string. **Slider (v0.9 host):** optional \`decimalPlaces\` (\`0\`–\`3\`) or \`step\` for fractional values; omit for integer steps.

**Charts:** A \`LineChart\` \`series\` binding may resolve to a plain \`number[]\` (e.g. one \`series_expr\`) — the host renders it as one line. For **multiple** named series, each row’s \`values\` \`series_expr\` still needs the full sweep keys above. Give object rows a \`name\` when you need the legend label.

**Button actions:** Besides catalog \`openUrl\` via \`functionCall\`, this app supports host events such as \`host.openUrl\` in \`action.event.name\` (see copy-paste template below).

**Symbolic calculus (host, no chat round-trip):** \`action.event.name\` may be \`math.sympyDifferentiate\` or \`math.sympyIntegrate\`. The host runs **SymPy** in the Python sandbox (\`sympy\`, \`numpy\` packages). Initialize (via \`updateDataModel\`) at least \`/expression\` (string, math-like e.g. \`sin(x)*exp(x)\`) and \`/variable\` (differentiation/integration symbol, usually \`x\`); optional **\`/wrt\`** overrides \`/variable\` when you want a partial derivative w.r.t. one symbol (same as SymPy \`diff(expr, wrt)\`). Optional \`/xMin\`, \`/xMax\`, \`/steps\` for sampling the result into \`/symbolicSeries\`. After the action, the surface gets \`/symbolicText\`, \`/symbolicLatex\`, \`/symbolicSeries\`, and \`/symbolicError\` (empty string on success). You may pass the same fields in \`action.event.context\` to override paths for one-off buttons.`;
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
