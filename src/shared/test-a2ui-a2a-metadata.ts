import { describe, expect, it } from "vitest";
import { buildA2uiClientMessageMetadata } from "./a2ui-a2a-metadata";
import { A2UI_V08_STANDARD_CATALOG_JSON_URL } from "./a2ui-catalog-constants";

describe("buildA2uiClientMessageMetadata", () => {
  it("includes a2uiClientCapabilities with supportedCatalogIds", () => {
    const m = buildA2uiClientMessageMetadata();
    expect(m.a2uiClientCapabilities).toBeDefined();
    const caps = m.a2uiClientCapabilities as {
      supportedCatalogIds: string[];
      acceptsInlineCatalogs?: boolean;
    };
    expect(caps.supportedCatalogIds).toContain(A2UI_V08_STANDARD_CATALOG_JSON_URL);
    expect(caps.acceptsInlineCatalogs).toBe(false);
  });

  it("allows overriding acceptsInlineCatalogs", () => {
    const m = buildA2uiClientMessageMetadata({ acceptsInlineCatalogs: true });
    const caps = m.a2uiClientCapabilities as { acceptsInlineCatalogs?: boolean };
    expect(caps.acceptsInlineCatalogs).toBe(true);
  });
});
