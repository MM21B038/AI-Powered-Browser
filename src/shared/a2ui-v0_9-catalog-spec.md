# Autonomous Browser — A2UI v0.9 host interactive catalog

**`catalogId` (required):** use exactly the string from the system checklist (`autonomous-browser.local` host catalog URL). Do **not** use the upstream `a2ui.org` basic catalog URL for new surfaces.

**Upstream reference (read-only):** component prop shapes follow [A2UI basic catalog v0.9](https://a2ui.org/specification/v0_9/basic_catalog.json) and `common_types.json`. This host ships a **filtered** in-process catalog: layout, media, interactive inputs, charts (`LineChart`, `BarChart`, `AreaChart`, `PieChart`, `Histogram`, `DensityPlot`), `Spacer`, `Button`, and `Dropdown` are **Autonomous Browser renderers** (shared spacing tokens and host CSS). NDJSON still uses **only** catalog-defined props — density, margins, and chart colors come from the shell (semantic series slots), not ad-hoc styling in messages. Extra expression functions are listed after this document (including `sparkline_svg` for tiny data-URL sparklines when you do not need a full chart).

---

## Host rules (styling and safety)

1. **Theme only:** do **not** invent `color`, `backgroundColor`, `borderColor`, hex codes, or arbitrary CSS on components. The renderer applies look-and-feel; you only set **catalog-defined** props (`variant`, `fit`, layout enums, etc.).
2. **Strict props:** only use properties documented below for each component; `unevaluatedProperties` behavior applies through the upstream schemas.
3. **Wire:** NDJSON with `"version":"v0.9"`, then `createSurface` → **one `updateComponents` message per NDJSON line**, with **`components` containing exactly one component row per line** (do not put the whole tree in a single `updateComponents` line). Then optional `updateDataModel` lines (`path` + `value` each). No `beginRendering` in v0.9.
4. **Bindings:** use `{ "path": "<json-pointer-style path>" }` for `Dynamic*` fields; initialize values with `updateDataModel`.

### Host density (spacing)

The renderer applies shared CSS variables for rhythm (for example `--a2ui-host-leaf-margin`, `--a2ui-host-card-padding`, `--a2ui-host-stack-gap`). **Do not** invent pixel spacing, margins, or arbitrary CSS in NDJSON — use `Row` / `Column` / `List`, **`Card`** when you need chrome, and **`Spacer`** when you need an empty flex gap between siblings.

---

## Allowed component types (host catalog)

**Layout / content:** `Column`, `Row`, `Text`, `Card`, `Divider`, `List`, `Image`, `Tabs`, `Modal`, `Icon`, `Video`, `AudioPlayer`, `Spacer`

**Interactive:** `TextField`, `Button`, `Slider`, `CheckBox`, `ChoicePicker`, `Dropdown`, `DateTimeInput`

**Charts (host):** `LineChart`, `BarChart`, `AreaChart`, `PieChart`, `Histogram`, `DensityPlot` — see [Charts (host)](#charts-host).

For a **native single-select** (HTML `<select>`), use **`Dropdown`** (`value` is a **`DynamicString`**). Use **`ChoicePicker`** for multi-select, checkbox/radio/chip layouts, or searchable lists (`filterable`).

---

## Interactive components (props and enums)

### TextField

| Property           | Required | Notes |
| ------------------ | -------- | ----- |
| `component`        | yes      | `"TextField"` |
| `label`            | yes      | `DynamicString` |
| `value`            | no       | `DynamicString` — bind for two-way text |
| `variant`          | no       | `shortText` (default), `longText`, `number`, `obscured` |
| `validationRegexp` | no       | string |

### Button

Host-themed; **`variant`** picks the visual role (still only catalog enums — no custom colors in NDJSON):

| Property    | Required | Notes |
| ----------- | -------- | ----- |
| `component` | yes      | `"Button"` |
| `child`     | yes      | id of a `Text` (or `Icon`) child |
| `action`    | yes      | `event` `{ name, context }` or catalog `functionCall` |
| `variant`   | no       | **`primary`** — filled call-to-action using `var(--accent)` / `var(--bg0)` text (use for main actions). **`default`** — secondary / neutral surface + border (secondary actions). **`borderless`** — link-style accent text, underline on hover (tertiary / low emphasis). Omit or `default` for standard actions. |

### Slider

| Property    | Required | Notes |
| ----------- | -------- | ----- |
| `component` | yes      | `"Slider"` |
| `value`     | yes      | `DynamicNumber` |
| `max`       | yes      | number |
| `min`       | no       | number, default `0` |
| `label`     | no       | `DynamicString` |
| `decimalPlaces` | no   | **Host:** `0`–`3`. `0` (or omit) = whole-number steps (`step` 1). `1`–`3` = fractional steps with at most that many decimals (e.g. `3` → step `0.001`). |
| `step`      | no       | **Host:** explicit HTML `range` step (positive number). If set, it overrides the step implied by `decimalPlaces`. |

### CheckBox

| Property    | Required | Notes |
| ----------- | -------- | ----- |
| `component` | yes      | `"CheckBox"` |
| `label`     | yes      | `DynamicString` |
| `value`     | yes      | `DynamicBoolean` |

### ChoicePicker (“dropdown” / option lists)

| Property       | Required | Notes |
| -------------- | -------- | ----- |
| `component`    | yes      | `"ChoicePicker"` |
| `options`      | yes      | array of `{ label: DynamicString, value: string }` |
| `value`        | yes      | `DynamicStringList` — selected option values |
| `label`        | no       | group label |
| `variant`      | no       | `mutuallyExclusive` (default) or `multipleSelection` |
| `displayStyle` | no       | `checkbox` (default) or `chips` |
| `filterable`   | no       | boolean, default `false` — set `true` for searchable “dropdown” |

### Dropdown (native single-select)

| Property      | Required | Notes |
| ------------- | -------- | ----- |
| `component`   | yes      | `"Dropdown"` |
| `options`     | yes      | array of `{ label: DynamicString, value: string }`, at least one option |
| `value`       | yes      | `DynamicString` — selected option value (bind to a **string**, not an array) |
| `label`       | no       | field label |
| `placeholder` | no       | when set, adds a first option with value `""` and this label (use with initial `""` in the data model) |

### DateTimeInput

| Property     | Required | Notes |
| ------------ | -------- | ----- |
| `component`  | yes      | `"DateTimeInput"` |
| `value`      | yes      | `DynamicString` — ISO 8601 `date` / `time` / `date-time` |
| `enableDate` | no       | boolean, default `false` |
| `enableTime` | no       | boolean, default `false` |
| `min`, `max` | no       | `DynamicString` ISO bounds |
| `label`      | no       | `DynamicString` |

---

## Layout quick reference

- **Row / Column:** `children` as id array or `ChildList` template object; `justify`, `align` per upstream enums.
- **Card:** single `child` id (wrap content in `Column` / `Row`).
- **Text:** `text` (`DynamicString`), `variant`: `h1`–`h5`, `body`, `caption`.
- **Spacer:** host-only flex helper — no children. Optional `weight` (flex-grow, default when omitted: `1`), optional `minWidth` / `minHeight` as allowed CSS lengths (`8px`, `1rem`, `10%`, or `0`). Use between `Row` children to push controls (e.g. title left, actions right).

### Spacer

| Property   | Required | Notes |
| ---------- | -------- | ----- |
| `component`| yes      | `"Spacer"` |
| `weight`   | no       | number — flex-grow in a `Row` / `Column` (same meaning as other components). |
| `minWidth` | no       | string — `8px`, `1rem`, `10%`, or `0` only. |
| `minHeight`| no       | string — same allowed forms as `minWidth`. |

### Icon

The renderer **self-hosts** Google **Material Symbols** (Outlined, Rounded, Sharp) via Fontsource so icons work offline and under CSP (`font-src 'self'`). Styling uses shell theme tokens (`color` follows `var(--text)`).

| Property    | Required | Notes |
| ----------- | -------- | ----- |
| `component` | yes      | `"Icon"` |
| `name`      | yes      | Icon identifier string, or `{ "path": "/..." }` bound to a string in the data model (same shapes as other `DynamicString` fields). |

**Common mistakes:** Use **`name`**, not `iconName`. Do not add **`size`** or other undocumented keys — the catalog uses `unevaluatedProperties: false`, so extra properties **fail validation** and the surface will not render. The host repair helper [`repairA2uiV09JsonlForHost`](./a2ui-v0_9-repair.ts) rewrites `iconName` → `name` and strips `size` when present in `updateComponents`.

**Material icon names**

- The [Material Symbols](https://fonts.google.com/icons) catalog uses **ligature** names (usually `snake_case`, e.g. `arrow_back`, `account_circle`).
- The upstream basic catalog may expose a **camelCase** enum (e.g. `arrowBack`); the host **normalizes** camelCase to snake_case ligatures for the font.
- **Style families** (separate variable fonts): prefix the ligature with **`rounded:`**, **`sharp:`**, or **`outlined:`** (optional; default is outlined). Examples: `rounded:search`, `sharp:arrowBack`, `outlined:home`.

**Host-only extras (inline SVG, `currentColor`)**

Use the literal prefix **`host:`** plus one of: **`autonomous`**, **`agent`**, **`browser`** — e.g. `host:autonomous`, `host:agent`, `host:browser`. Unknown `host:…` keys fall back to the `help` glyph.

**Strict validation note:** If your pipeline validates each line against the upstream JSON Schema, `name` may be restricted to the catalog’s **enum** of strings. To use arbitrary Material ligatures or `host:…` keys, ensure the message still passes your validator (or supply the resolved string through `updateDataModel` + `{ "path": "..." }` where appropriate).

---

## Charts (host)

Charts use **Recharts** in the shell with theme tokens (`--a2ui-host-chart-series-0` … `--a2ui-host-chart-series-7`). Do **not** set stroke/fill hex in NDJSON.

**Shared ideas**

- **`series`** (cartesian): array of `{ "name": string, "values": number[] }` or `{ "path": "..." }` binding to an array of those objects. The host also accepts **`series` as a bare `number[]`** (e.g. a `functionCall` that returns `series_expr` output) — it is shown as a single line named **Series**. If `name` is omitted on an object row, the host assigns **Series 1**, **Series 2**, … Numeric strings in `values` are coerced to numbers. Each series’ `values` can also bind to a **number array** with `{ "path": "..." }` when using the repair helper shape `values: { "path": "/model/series" }`.
- **`categories`**: optional string array (or path) for X labels; if omitted, indices `0..n-1` are used.
- **`title`**, **`showLegend`**, **`legendPosition`**: `top` | `bottom` | `left` | `right`.
- **`heightPx`**: approximate plot height (default around 260–320).

**Host resolver (cartesian charts):** The Autonomous Browser host **evaluates** `{ "path": "..." }` and `{ "call", "args" }` bindings **inside** each `series[]` row’s `values` (and on `categories` when used as a dynamic value). Upstream `GenericBinder` does not recurse into those nested shapes; relying on this host behavior keeps multi-series `LineChart` / `BarChart` / `AreaChart` wire the same — you do not need to flatten expressions into the data model for the chart to render.

**Axes (cartesian `LineChart` / `BarChart` / `AreaChart`):** The horizontal axis is **categorical** (labels from `categories` or index strings `0`…`n-1`), not a continuous “X math” domain in Recharts. The **vertical** axis is the **numeric value** scale (or the horizontal numeric axis for **horizontal** `BarChart`). If **every** plotted value across all series is **≥ 0**, the host pins the **value** axis to start at **0** so the plot does not extend into negative tick marks unless the data requires it. If any point is negative, the axis uses an automatic domain. Large values use **compact** tick labels (locale-aware, e.g. millions). Dense or long category labels may be shown **tilted** for readability.

| Component | Role | Notable props |
|-----------|------|----------------|
| `LineChart` | Multi-series lines | `stepped`, `showGrid` |
| `BarChart` | Bars | `orientation`: `vertical` \| `horizontal`, `layout`: `grouped` \| `stacked` |
| `AreaChart` | Filled areas | `stackMode`: `overlay` \| `stacked` |
| `PieChart` | Slices | `segments`: `[{ label, value }]`, `variant`: `pie` \| `donut` |
| `Histogram` | Binned counts | `samples` (number[]), `binCount`, `normalize`: `count` \| `density` |
| `DensityPlot` | KDE curve | `samples` (number[]) |

For **sparkline-only** images (no axes/legend), you may still use `Image` with `url` from the `sparkline_svg` catalog function.

### Derived values and formulas (catalog functions)

The host catalog registers extra **expression functions** (same list as in the LLM appendix), including:

| Function | Returns | Purpose |
|----------|---------|---------|
| `math_eval` | number | Evaluate a **mathjs** expression. Put each model input on its **own top-level key** in `args` (e.g. `a`, `b`) with `{ "path": "/..." }` or a number. The renderer re-runs the call when those paths change. |
| `series_expr` | number[] | Sample `expression` over swept `x` from `xMin`…`xMax` in `steps` steps. **Required on every call:** `expression`, `xMin`, `xMax`, and `steps` (including **each** `series[].values` functionCall on a chart — not only `categories`). Omitting the sweep fails validation and shows an empty chart. **`xMin`, `xMax`, and `steps`** each accept a **literal number** or a **dynamic number** (`{ "path": "..." }`, or a nested `functionCall` returning a number), on their **own top-level** `args` keys — same pattern as variables such as `a` from a Slider. Use the **same** sweep for all series on one chart so points align. |
| `format_currency` | string | Full **currency** string (`value`, optional `currency`, `maxFractionDigits`). |
| `format_compact_currency` | string | **Compact** currency (e.g. `$48K`, `$1.2M`) so KPI `Text` stays short in narrow rows. Args: `value` (number or `{ "path": "..." }`), optional `currency`, `maxFractionDigits`, `locale` (e.g. `"en-US"` for stable output). Prefer this over `format_currency` for large dashboard headline amounts. |

**Reactivity rule:** Only **top-level** keys inside `args` participate in reactive binding. Do **not** nest `{ path }` bindings deep inside objects — the data layer will not subscribe to them.

**`series_expr` sweep:** Every `series_expr` must list `xMin`, `xMax`, and `steps` beside `expression` and any variables (`p`, `a`, …). A common mistake is putting `series_expr` only on `categories` but omitting the sweep on each `LineChart` `series[].values` call — that produces **no series data**.

**Example — Text shows `a^2` with `a` from a Slider**

`Text.text` expects a string; wrap the numeric result with `toString`:

```json
{ "call": "toString", "args": { "value": { "call": "math_eval", "args": { "expression": "a^2", "a": { "path": "/a" } }, "returnType": "number" } } }
```

**Example — `LineChart` series follows `y = x * a` with `a` from a Slider**

```json
{ "call": "series_expr", "args": {
  "expression": "x * a",
  "xMin": 0,
  "xMax": 10,
  "steps": 40,
  "a": { "path": "/a" }
}, "returnType": "array" }
```

**Example — sweep upper bound from the data model**

```json
{ "call": "series_expr", "args": {
  "expression": "x * a",
  "xMin": 0,
  "xMax": { "path": "/domainEnd" },
  "steps": 40,
  "a": { "path": "/a" }
}, "returnType": "array" }
```

Bind that `functionCall` as **`"series": { ... }`** at the chart root when the expression returns a `number[]`, or as **`series[0].values`** inside `{ "name": "…", "values": { … } }` when using the object form.

**Example — compact currency KPI (`Text.text` is a `functionCall`)**

```json
{ "call": "format_compact_currency", "args": {
  "value": { "path": "/totals/compound" },
  "currency": "USD",
  "locale": "en-US",
  "maxFractionDigits": 2
}, "returnType": "string" }
```

---

## Copy-paste NDJSON examples (host `catalogId`)

**1) Slider 0–100 + live readout**

```json
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["title","sl","readout"],"justify":"start","align":"stretch"},
  {"id":"title","component":"Text","text":"Volume","variant":"h3"},
  {"id":"sl","component":"Slider","label":"Level","min":0,"max":100,"value":{"path":"/level"}},
  {"id":"readout","component":"Text","text":{"path":"/level"},"variant":"body"}
]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/level","value":50}}
```

**2) TextField + primary Button (event)**

```json
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["emailLabel","email","go"],"justify":"start","align":"stretch"},
  {"id":"emailLabel","component":"Text","text":"Email","variant":"caption"},
  {"id":"email","component":"TextField","label":"Address","value":{"path":"/email"},"variant":"shortText"},
  {"id":"go","component":"Button","child":"goTxt","variant":"primary","action":{"event":{"name":"host.openUrl","context":{"url":"https://example.com"}}}},
  {"id":"goTxt","component":"Text","text":"Continue","variant":"body"}
]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/email","value":""}}
```

**3) Dropdown (native select, single value)**

```json
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["pick"],"justify":"start","align":"stretch"},
  {"id":"pick","component":"Dropdown","label":"Region","placeholder":"Select…","options":[
    {"label":"Americas","value":"ame"},
    {"label":"Europe","value":"eur"},
    {"label":"Asia","value":"asia"}
  ],"value":{"path":"/region"}}
]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/region","value":""}}
```

**4) ChoicePicker (multi / chips / filterable)**

```json
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["pick"],"justify":"start","align":"stretch"},
  {"id":"pick","component":"ChoicePicker","label":"Region","variant":"mutuallyExclusive","displayStyle":"chips","filterable":true,"options":[
    {"label":"Americas","value":"ame"},
    {"label":"Europe","value":"eur"},
    {"label":"Asia","value":"asia"}
  ],"value":{"path":"/region"}}
]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/region","value":[]}}
```

**5) DateTimeInput (date only)**

```json
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["due"],"justify":"start","align":"stretch"},
  {"id":"due","component":"DateTimeInput","label":"Due date","enableDate":true,"enableTime":false,"value":{"path":"/due"}}
]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/due","value":""}}
```

**6) Dense form row (two fields in one row)**

```json
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["card"],"justify":"start","align":"stretch"},
  {"id":"card","component":"Card","child":"formRow"},
  {"id":"formRow","component":"Row","children":["nameF","qtyF"],"justify":"start","align":"stretch"},
  {"id":"nameF","component":"TextField","label":"Name","value":{"path":"/name"},"variant":"shortText"},
  {"id":"qtyF","component":"TextField","label":"Qty","value":{"path":"/qty"},"variant":"number"}
]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/name","value":""}}
{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/qty","value":1}}
```

**7) Toolbar with `Spacer` (title left, actions right)**

```json
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["bar"],"justify":"start","align":"stretch"},
  {"id":"bar","component":"Row","children":["title","gap","save"],"justify":"start","align":"center"},
  {"id":"title","component":"Text","text":"Settings","variant":"h3"},
  {"id":"gap","component":"Spacer","weight":1},
  {"id":"save","component":"Button","child":"saveTxt","variant":"primary","action":{"event":{"name":"host.save","context":{}}}},
  {"id":"saveTxt","component":"Text","text":"Save","variant":"body"}
]}}
```

**8) `LineChart` (two series + categories)**

```json
{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}
{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["lc"],"justify":"start","align":"stretch"},
  {"id":"lc","component":"LineChart","title":"Trend","categories":["Mon","Tue","Wed","Thu","Fri"],"series":[
    {"name":"Alpha","values":[12,18,15,22,20]},
    {"name":"Beta","values":[8,10,14,12,16]}
  ],"showLegend":true,"legendPosition":"bottom","heightPx":280}
]}}
```

The `catalogId` above must match the value in the system checklist exactly.
