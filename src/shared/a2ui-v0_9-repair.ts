import { A2UI_V09_BASIC_CATALOG_JSON_URL, A2UI_V09_VERSION } from "./a2ui-v0_9-constants";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function stripCStyleComments(text: string): string {
  // Remove /* ... */ blocks that frequently appear in model output.
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripLineComments(text: string): string {
  // Remove leading `// ...` lines (models sometimes include them in JSONL blocks).
  return text
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

function stripLoadingSentinels(text: string): string {
  return text.replace(/\[Loading root\.\.\.\]\s*/g, "");
}

function maybeFixUpdateDataModelShape(msg: any): { changed: boolean; out: any[] } {
  // v0.9 expects: updateDataModel: { surfaceId, path?, value? }
  // Common mistakes:
  // - { updateDataModel: { surfaceId, dataModel: {...} } }
  // - { updateDataModel: { surfaceId, data: { a: 1, b: 2 } } }  (LLMs often use "data")
  // - { updateDataModel: { surfaceId, updates: [{path, value}, ...] } }
  if (!msg?.updateDataModel || !isRecord(msg.updateDataModel)) return { changed: false, out: [msg] };

  const udm = msg.updateDataModel as any;
  let changed = false;

  if ("dataModel" in udm && !("value" in udm)) {
    udm.value = udm.dataModel;
    delete udm.dataModel;
    changed = true;
  }

  // Flat `data` object → one updateDataModel line per key (JSON Pointer path).
  if (
    "data" in udm &&
    isRecord(udm.data) &&
    !("path" in udm) &&
    !("value" in udm) &&
    !Array.isArray(udm.data)
  ) {
    const surfaceId = udm.surfaceId;
    const out: any[] = [];
    for (const [k, v] of Object.entries(udm.data)) {
      const path = k.startsWith("/") ? k : `/${k}`;
      out.push({
        version: msg.version ?? A2UI_V09_VERSION,
        updateDataModel: {
          surfaceId,
          path,
          value: v,
        },
      });
    }
    if (out.length > 0) return { changed: true, out };
  }

  if (Array.isArray(udm.updates) && !("path" in udm) && !("value" in udm)) {
    // Expand to multiple updateDataModel messages.
    const surfaceId = udm.surfaceId;
    const out: any[] = [];
    for (const u of udm.updates) {
      if (!isRecord(u)) continue;
      if (typeof (u as any).path !== "string") continue;
      out.push({
        version: msg.version ?? A2UI_V09_VERSION,
        updateDataModel: {
          surfaceId,
          path: (u as any).path,
          value: (u as any).value,
        },
      });
    }
    if (out.length > 0) return { changed: true, out };
  }

  return { changed, out: [msg] };
}

/**
 * Repair common "almost v0.9" outputs into valid v0.9 NDJSON:
 * - Loose component rows without updateComponents wrapper
 * - updateDataModel with wrong key (dataModel -> value)
 * - Non-catalog components: LineChart -> Image + sparkline_svg when possible
 */
export function repairA2uiV09JsonlForHost(input: string, opts: { surfaceId: string }): string | null {
  const surfaceId = opts.surfaceId.trim();
  if (!surfaceId) return null;

  const cleaned = stripLoadingSentinels(stripLineComments(stripCStyleComments(input))).trim();

  // If it already looks like proper v0.9 NDJSON, don't touch it.
  if (/"version"\s*:\s*"v0\.9"\s*,\s*"(createSurface|updateComponents|updateDataModel|deleteSurface)"/.test(cleaned)) {
    // Fix common mistakes while keeping NDJSON.
    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const fixed: string[] = [];
    let changed = false;
    for (const l of lines) {
      try {
        const j = JSON.parse(l) as any;
        const r = maybeFixUpdateDataModelShape(j);
        if (r.changed) changed = true;
        for (const msg of r.out) fixed.push(JSON.stringify(msg));
      } catch {
        fixed.push(l);
      }
    }
    return changed ? fixed.join("\n") : null;
  }

  // Try to parse loose component rows: lines that are JSON objects with {id, component, ...}
  const lines = cleaned.split(/\r?\n/);
  const components: any[] = [];
  for (const raw of lines) {
    const line = raw.trim().replace(/,$/, "");
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const obj = JSON.parse(line) as any;
      if (!isRecord(obj)) continue;
      if (typeof obj.id === "string" && typeof obj.component === "string") {
        // Basic repair: LineChart -> Image sparkline if possible.
        if (obj.component === "LineChart") {
          const seriesPath =
            typeof (obj as any).data?.path === "string"
              ? (obj as any).data.path
              : typeof (obj as any).series?.path === "string"
                ? (obj as any).series.path
                : null;
          components.push({
            id: obj.id,
            component: "Image",
            url: seriesPath
              ? { call: "sparkline_svg", args: { series: { path: seriesPath } }, returnType: "string" }
              : "",
            description: "Chart",
            fit: "contain",
            variant: "largeFeature",
          });
          continue;
        }
        components.push(obj);
      }
    } catch {
      /* skip */
    }
  }

  if (components.length === 0) return null;

  const repaired = [
    JSON.stringify({
      version: A2UI_V09_VERSION,
      createSurface: { surfaceId, catalogId: A2UI_V09_BASIC_CATALOG_JSON_URL },
    }),
    JSON.stringify({
      version: A2UI_V09_VERSION,
      updateComponents: { surfaceId, components },
    }),
  ].join("\n");
  return repaired;
}

