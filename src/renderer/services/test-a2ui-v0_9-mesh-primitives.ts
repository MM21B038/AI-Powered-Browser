import { describe, expect, it } from "vitest";
import {
  meshBox,
  meshCone,
  meshCuboid,
  meshCylinder,
  meshMaxVertexIndex,
  meshMerge,
  meshMergeMany,
  meshParametricUv,
  meshSphere,
  meshTorus,
  meshTriangleCount,
} from "./a2ui-v0_9-mesh-primitives";

describe("a2ui v0.9 mesh primitives", () => {
  it("meshBox has 12 triangles and valid vertex indices", () => {
    const m = meshBox(0, 0, 0, 1, 2, 3);
    expect(m.x.length).toBe(8);
    expect(meshTriangleCount(m)).toBe(12);
    expect(meshMaxVertexIndex(m)).toBe(7);
    for (let t = 0; t < m.i.length; t++) {
      expect(m.i[t]).toBeGreaterThanOrEqual(0);
      expect(m.i[t]).toBeLessThanOrEqual(7);
      expect(m.j[t]).toBeGreaterThanOrEqual(0);
      expect(m.k[t]).toBeGreaterThanOrEqual(0);
    }
  });

  it("meshCuboid matches box extents", () => {
    const m = meshCuboid(0, 0, 0, 1, 1, 1);
    expect(Math.min(...m.x)).toBe(-1);
    expect(Math.max(...m.x)).toBe(1);
  });

  it("meshSphere produces mesh with triangles", () => {
    const m = meshSphere(0, 0, 0, 2, 16);
    expect(m.x.length).toBeGreaterThan(20);
    expect(meshTriangleCount(m)).toBeGreaterThan(0);
    expect(meshMaxVertexIndex(m)).toBe(m.x.length - 1);
  });

  it("meshCylinder side has quads * 2 tris per quad", () => {
    const m = meshCylinder({
      cx: 0,
      cy: 0,
      cz: 0,
      radius: 1,
      height: 2,
      radialSegments: 8,
      heightSegments: 4,
      caps: false,
    });
    const ring = 8;
    const stacks = 4;
    expect(m.x.length).toBe((stacks + 1) * ring);
    expect(meshTriangleCount(m)).toBe(stacks * ring * 2);
  });

  it("meshCone has side triangles and optional base", () => {
    const withCap = meshCone({
      cx: 0,
      cy: 0,
      cz: 0,
      baseRadius: 1,
      height: 2,
      radialSegments: 6,
      caps: true,
    });
    expect(meshTriangleCount(withCap)).toBeGreaterThanOrEqual(6 + 6);
    const noCap = meshCone({
      cx: 0,
      cy: 0,
      cz: 0,
      baseRadius: 1,
      height: 2,
      radialSegments: 6,
      caps: false,
    });
    expect(meshTriangleCount(noCap)).toBe(6);
  });

  it("meshTorus is non-empty", () => {
    const m = meshTorus({
      cx: 0,
      cy: 0,
      cz: 0,
      majorRadius: 3,
      minorRadius: 0.5,
      uSegments: 12,
      vSegments: 8,
    });
    expect(meshTriangleCount(m)).toBe(12 * 8 * 2);
  });

  it("meshMerge offsets second mesh indices", () => {
    const a = meshBox(0, 0, 0, 1, 1, 1);
    const b = meshBox(10, 10, 10, 11, 11, 11);
    const m = meshMerge(a, b);
    expect(m.x.length).toBe(16);
    expect(meshTriangleCount(m)).toBe(24);
    expect(meshMaxVertexIndex(m)).toBe(15);
    const lastTriI = m.i[m.i.length - 1]!;
    expect(lastTriI).toBeGreaterThanOrEqual(8);
  });

  it("meshMergeMany chains merges", () => {
    const m = meshMergeMany([meshBox(0, 0, 0, 1, 1, 1), meshBox(2, 0, 0, 3, 1, 1)]);
    expect(meshTriangleCount(m)).toBe(24);
  });

  it("meshParametricUv builds a plane patch", () => {
    const m = meshParametricUv({
      xExpression: "u",
      yExpression: "v",
      zExpression: "0",
      uMin: 0,
      uMax: 1,
      vMin: 0,
      vMax: 1,
      uSteps: 8,
      vSteps: 6,
    });
    expect(m.x.length).toBe((8 + 1) * (6 + 1));
    expect(meshTriangleCount(m)).toBe(8 * 6 * 2);
    expect(m.z.every((z) => z === 0)).toBe(true);
  });
});
