import { describe, expect, it } from "vitest";
import { filterToolCatalogSuggestions } from "./ai-tool-mentions";

describe("filterToolCatalogSuggestions", () => {
  const items = [
    { name: "butcher_click", description: "Click an element" },
    { name: "intelligent_read", description: "Read page text" },
    { name: "other_tool", description: "Uses click in prose" },
  ];

  it("returns prefix name matches first", () => {
    const r = filterToolCatalogSuggestions(items, "butcher", 6);
    expect(r[0]?.name).toBe("butcher_click");
  });

  it("finds by description substring", () => {
    const r = filterToolCatalogSuggestions(items, "page", 6);
    expect(r.some((x) => x.name === "intelligent_read")).toBe(true);
  });
});
