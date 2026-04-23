import { describe, expect, it } from "vitest";
import { meshBox, meshCone, meshSphere } from "../../../services/a2ui-v0_9-mesh-primitives";
import { resolveMultiTraces } from "./A2uiV09HostPlot3D";

describe("Plot3D multi-trace resolve", () => {
  it("returns null for empty or missing traces", () => {
    expect(resolveMultiTraces(undefined, null)).toBeNull();
    expect(resolveMultiTraces([], null)).toBeNull();
  });

  it("resolves a single mesh trace", () => {
    const m = meshBox(0, 0, 0, 1, 1, 1);
    const tr = [{ traceType: "mesh" as const, ...m, name: "box" }];
    const out = resolveMultiTraces(tr, null);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(1);
    expect(out![0]!.traceType).toBe("mesh");
    if (out![0]!.traceType === "mesh") {
      expect(out![0]!.mesh.x.length).toBe(8);
      expect(out![0]!.name).toBe("box");
    }
  });

  it("resolves surface + scatter in order", () => {
    const traces = [
      {
        traceType: "surface" as const,
        x: [0, 1],
        y: [0, 1],
        z: [
          [0, 0],
          [0, 0],
        ],
      },
      {
        traceType: "scatter" as const,
        points: [
          { x: 0.5, y: 0.5, z: 1 },
          { x: -1, y: 0, z: 0 },
        ],
      },
    ];
    const out = resolveMultiTraces(traces, null);
    expect(out!.length).toBe(2);
    expect(out![0]!.traceType).toBe("surface");
    expect(out![1]!.traceType).toBe("scatter");
    if (out![1]!.traceType === "scatter") {
      expect(out![1]!.points.length).toBe(2);
    }
  });

  it("resolves mesh fields when catalog call includes result property path (path not starting with /)", () => {
    const mesh = meshSphere(0, 0, 0, 2, 12);
    const dc = {
      resolveDynamicValue: (v: unknown) => {
        const o = v as { call?: string };
        if (o?.call === "mesh_sphere") return mesh;
        return undefined;
      },
    };
    const call = { call: "mesh_sphere", args: { radius: 2, widthSegments: 12 }, returnType: "object" as const };
    const traces = [
      {
        traceType: "mesh" as const,
        name: "S",
        x: { ...call, path: "x" },
        y: { ...call, path: "y" },
        z: { ...call, path: "z" },
        i: { ...call, path: "i" },
        j: { ...call, path: "j" },
        k: { ...call, path: "k" },
      },
    ];
    const out = resolveMultiTraces(traces, dc);
    expect(out!.length).toBe(1);
    expect(out![0]!.traceType).toBe("mesh");
    if (out![0]!.traceType === "mesh") {
      expect(out![0]!.mesh.x).toEqual(mesh.x);
    }
  });

  it("resolves mesh when only `x` contains the full mesh object (no y/z/i/j/k keys)", () => {
    const cone = meshCone({
      cx: 0,
      cy: 0,
      cz: -2,
      baseRadius: 1.5,
      height: 4,
      radialSegments: 12,
      caps: true,
    });
    const traces = [{ traceType: "mesh" as const, name: "Cone", x: cone, opacity: 1 }];
    const out = resolveMultiTraces(traces, null);
    expect(out!.length).toBe(1);
    expect(out![0]!.traceType).toBe("mesh");
    if (out![0]!.traceType === "mesh") {
      expect(out![0]!.mesh.i.length).toBeGreaterThan(0);
    }
  });
});
