import { describe, expect, it } from "vitest";
import { validateA2uiV09JsonlLinesStrict } from "./a2ui-v0_9-validate";
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

  it("rewrites Icon iconName to name and strips size for schema validation", () => {
    const bad = [
      '{"version":"v0.9","updateComponents":{"surfaceId":"icons-test","components":[{"id":"m","component":"Icon","iconName":"menu","size":32}]}}',
    ].join("\n");
    const out = repairA2uiV09JsonlForHost(bad, { surfaceId: "icons-test" });
    expect(out).toBeTruthy();
    expect(String(out)).toContain('"name":"menu"');
    expect(String(out)).not.toContain("iconName");
    expect(String(out)).not.toContain('"size"');
    const v = validateA2uiV09JsonlLinesStrict(String(out).trim());
    expect(v.ok).toBe(true);
  });

  it("fixes Icon rows inside full createSurface + updateComponents NDJSON", () => {
    const bad = [
      '{"version":"v0.9","createSurface":{"surfaceId":"icons-test","catalogId":"https://autonomous-browser.local/spec/a2ui/v0_9/host-interactive-catalog.json"}}',
      '{"version":"v0.9","updateComponents":{"surfaceId":"icons-test","components":[{"id":"root","component":"Row","children":["menuIcon","gap","settingsIcon"],"justify":"center","align":"center"},{"id":"menuIcon","component":"Icon","iconName":"menu","size":32},{"id":"gap","component":"Spacer","minWidth":"24px"},{"id":"settingsIcon","component":"Icon","iconName":"settings","size":32}]}}',
    ].join("\n");
    const out = repairA2uiV09JsonlForHost(bad, { surfaceId: "icons-test" });
    expect(out).toBeTruthy();
    expect(validateA2uiV09JsonlLinesStrict(String(out).trim()).ok).toBe(true);
    expect(String(out)).toContain('"name":"menu"');
    expect(String(out)).toContain('"name":"settings"');
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

