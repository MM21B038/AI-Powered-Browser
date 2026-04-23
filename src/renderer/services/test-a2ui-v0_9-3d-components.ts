import { describe, expect, it } from "vitest";
import { getA2uiV09HostCatalogComponentNames } from "./a2ui-v0_9-host-catalog";
import { Plot3DApi } from "../components/a2ui/v0_9/a2ui-v0_9-plot3d-types";
import { ModelViewer3DApi } from "../components/a2ui/v0_9/a2ui-v0_9-model-viewer-types";

describe("A2UI 3D components", () => {
  it("host catalog allowlist includes Plot3D and ModelViewer3D", () => {
    const names = getA2uiV09HostCatalogComponentNames();
    expect(names).toContain("Plot3D");
    expect(names).toContain("ModelViewer3D");
  });

  it("exports component APIs", () => {
    expect(Plot3DApi.name).toBe("Plot3D");
    expect(ModelViewer3DApi.name).toBe("ModelViewer3D");
    expect(Plot3DApi.schema).toBeTruthy();
    expect(ModelViewer3DApi.schema).toBeTruthy();
  });
});

