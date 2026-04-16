import { describe, expect, it } from "vitest";
import {
  A2UI_V09_HOST_ICON_EXTRA_KEYS,
  formatMaterialSymbolsLigature,
  resolveA2uiV09IconName,
} from "./a2ui-v0_9-host-icon-resolve";

describe("a2ui v0.9 host icon resolve", () => {
  it("exposes a stable whitelist of host: extra keys", () => {
    expect(A2UI_V09_HOST_ICON_EXTRA_KEYS).toEqual(["autonomous", "agent", "browser"]);
  });

  it("resolve empty name to help outlined", () => {
    expect(resolveA2uiV09IconName("")).toEqual({
      kind: "material",
      ligature: "help",
      style: "outlined",
    });
  });

  it("resolve host: extras", () => {
    expect(resolveA2uiV09IconName("host:autonomous")).toEqual({
      kind: "host",
      key: "autonomous",
    });
    expect(resolveA2uiV09IconName("host:agent")).toEqual({ kind: "host", key: "agent" });
    expect(resolveA2uiV09IconName("host:browser")).toEqual({ kind: "host", key: "browser" });
  });

  it("resolve unknown host: key to help", () => {
    expect(resolveA2uiV09IconName("host:unknown")).toEqual({
      kind: "material",
      ligature: "help",
      style: "outlined",
    });
  });

  it("resolve style prefixes and strips ligature", () => {
    expect(resolveA2uiV09IconName("rounded:search")).toEqual({
      kind: "material",
      ligature: "search",
      style: "rounded",
    });
    expect(resolveA2uiV09IconName("sharp:arrowBack")).toEqual({
      kind: "material",
      ligature: "arrow_back",
      style: "sharp",
    });
    expect(resolveA2uiV09IconName("outlined:home")).toEqual({
      kind: "material",
      ligature: "home",
      style: "outlined",
    });
  });

  it("defaults to outlined and formats catalog camelCase to ligatures", () => {
    expect(resolveA2uiV09IconName("visibilityOff")).toEqual({
      kind: "material",
      ligature: "visibility_off",
      style: "outlined",
    });
  });

  it("formatMaterialSymbolsLigature leaves snake_case and single tokens", () => {
    expect(formatMaterialSymbolsLigature("arrow_back")).toBe("arrow_back");
    expect(formatMaterialSymbolsLigature("search")).toBe("search");
  });
});
