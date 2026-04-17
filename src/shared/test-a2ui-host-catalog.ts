import { describe, expect, it } from "vitest";
import {
  A2UI_HOST_PRIMARY_CATALOG_ID,
  getHostSupportedCatalogIds,
} from "./a2ui-host-catalog";
import {
  A2UI_V09_BASIC_CATALOG_JSON_URL,
  A2UI_V09_HOST_CATALOG_JSON_URL,
} from "./a2ui-v0_9-constants";

describe("a2ui-host-catalog", () => {
  it("uses the host v0.9 catalog URL as primary id", () => {
    expect(A2UI_HOST_PRIMARY_CATALOG_ID).toBe(A2UI_V09_HOST_CATALOG_JSON_URL);
    expect(getHostSupportedCatalogIds()).toContain(A2UI_V09_HOST_CATALOG_JSON_URL);
    expect(getHostSupportedCatalogIds()).toContain(A2UI_V09_BASIC_CATALOG_JSON_URL);
  });
});
