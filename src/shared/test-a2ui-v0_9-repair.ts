import { describe, expect, it } from "vitest";
import { repairA2uiV09JsonlForHost } from "./a2ui-v0_9-repair";

describe("repairA2uiV09JsonlForHost", () => {
  it("wraps loose component rows into updateComponents", () => {
    const loose = [
      '[Loading root...]',
      '{"id":"root","component":"Column","children":["t"],"justify":"start","align":"stretch"},',
      '{"id":"t","component":"Text","text":"Hi","variant":"h2"}',
    ].join("\n");
    const out = repairA2uiV09JsonlForHost(loose, { surfaceId: "main" });
    expect(out).toBeTruthy();
    expect(out).toContain('"createSurface"');
    expect(out).toContain('"updateComponents"');
  });

  it("rewrites updateDataModel.dataModel -> value", () => {
    const bad = JSON.stringify({
      version: "v0.9",
      updateDataModel: { surfaceId: "main", dataModel: { x: 1 } },
    });
    const out = repairA2uiV09JsonlForHost(bad, { surfaceId: "main" });
    expect(out).toContain('"value"');
    expect(out).not.toContain('"dataModel"');
  });

  it("expands updateDataModel.data (flat object) into multiple updateDataModel messages", () => {
    const bad = JSON.stringify({
      version: "v0.9",
      updateDataModel: {
        surfaceId: "main",
        data: { n: 42, label: "ok" },
      },
    });
    const out = repairA2uiV09JsonlForHost(bad, { surfaceId: "main" });
    expect(out).toBeTruthy();
    const lines = String(out).trim().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('"/n"');
    expect(lines[1]).toContain('"/label"');
  });

  it("expands updateDataModel.updates[] into multiple updateDataModel messages", () => {
    const bad = [
      JSON.stringify({
        version: "v0.9",
        updateDataModel: {
          surfaceId: "main",
          updates: [
            { path: "/a", value: 1 },
            { path: "/b", value: { ok: true } },
          ],
        },
      }),
    ].join("\n");
    const out = repairA2uiV09JsonlForHost(bad, { surfaceId: "main" });
    expect(out).toBeTruthy();
    const lines = String(out).trim().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('"updateDataModel"');
    expect(lines[1]).toContain('"updateDataModel"');
  });
});

