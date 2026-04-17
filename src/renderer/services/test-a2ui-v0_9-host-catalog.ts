import { describe, expect, it } from "vitest";
import { A2UI_V09_HOST_CATALOG_JSON_URL } from "../../shared/a2ui-v0_9-constants";
import { buildA2uiV09HostCatalog, getA2uiV09HostCatalogComponentNames } from "./a2ui-v0_9-host-catalog";

describe("buildA2uiV09HostCatalog", () => {
  it("uses the host catalog id", () => {
    const c = buildA2uiV09HostCatalog();
    expect(c.id).toBe(A2UI_V09_HOST_CATALOG_JSON_URL);
  });

  it("exposes only allowlisted component names", () => {
    const c = buildA2uiV09HostCatalog();
    const names = [...c.components.keys()].sort();
    expect(names).toEqual(getA2uiV09HostCatalogComponentNames());
    expect(names).toContain("Slider");
    expect(names).toContain("ChoicePicker");
    expect(names).toContain("Dropdown");
    expect(names).toContain("Spacer");
    expect(names).toContain("TextField");
    expect(names).toContain("LineChart");
    expect(names).toContain("BarChart");
    expect(names).toContain("PieChart");
    expect(names).toContain("Histogram");
    expect(names).not.toContain("FooBar");
  });

  it("includes upstream basic functions plus host extras", () => {
    const c = buildA2uiV09HostCatalog();
    expect(c.functions.has("required")).toBe(true);
    expect(c.functions.has("sparkline_svg")).toBe(true);
    expect(c.functions.has("format_compact_currency")).toBe(true);
  });

  it("registers host layout components with React renderers", () => {
    const c = buildA2uiV09HostCatalog();
    const text = c.components.get("Text") as { name?: string; render?: unknown } | undefined;
    expect(text?.name).toBe("Text");
    expect(typeof text?.render).toBe("function");
  });

  it("registers host Button with React renderer", () => {
    const c = buildA2uiV09HostCatalog();
    const btn = c.components.get("Button") as { name?: string; render?: unknown } | undefined;
    expect(btn?.name).toBe("Button");
    expect(typeof btn?.render).toBe("function");
  });

  it("registers host TextField and Spacer with React renderers", () => {
    const c = buildA2uiV09HostCatalog();
    const tf = c.components.get("TextField") as { name?: string; render?: unknown } | undefined;
    expect(tf?.name).toBe("TextField");
    expect(typeof tf?.render).toBe("function");
    const sp = c.components.get("Spacer") as { name?: string; render?: unknown } | undefined;
    expect(sp?.name).toBe("Spacer");
    expect(typeof sp?.render).toBe("function");
  });

  it("registers host chart components with React renderers", () => {
    const c = buildA2uiV09HostCatalog();
    const lc = c.components.get("LineChart") as { name?: string; render?: unknown } | undefined;
    expect(lc?.name).toBe("LineChart");
    expect(typeof lc?.render).toBe("function");
  });
});
