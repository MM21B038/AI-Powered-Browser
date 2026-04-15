import { describe, expect, it } from "vitest";
import {
  A2UI_HOST_PRIMARY_CATALOG_ID,
  getHostSupportedCatalogIds,
} from "./a2ui-host-catalog";
import { A2UI_V08_STANDARD_CATALOG_JSON_URL } from "./a2ui-catalog-constants";

describe("a2ui-host-catalog", () => {
  it("uses the official v0.8 standard catalog URL as primary id", () => {
    expect(A2UI_HOST_PRIMARY_CATALOG_ID).toBe(A2UI_V08_STANDARD_CATALOG_JSON_URL);
    expect(getHostSupportedCatalogIds()).toContain(A2UI_V08_STANDARD_CATALOG_JSON_URL);
  });
});
