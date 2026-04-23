/**
 * Plotly mesh3d payloads: flat vertex lists plus triangle indices i,j,k (0-based).
 */

import { clampSurfaceSteps, evaluateMathExpression } from "./a2ui-v0_9-math-catalog-helpers";

export type Mesh3dData = {
  x: number[];
  y: number[];
  z: number[];
  i: number[];
  j: number[];
  k: number[];
};

/** Aligns with surface grid caps — mesh segment counts stay bounded for WebGL. */
export const MESH_MAX_RADIAL_SEGMENTS = 64;
export const MESH_MAX_HEIGHT_SEGMENTS = 48;
export const MESH_MAX_TORUS_U = 64;
export const MESH_MAX_TORUS_V = 48;

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

/** Plotly mesh3d: parallel i,j,k — one triangle per index t with corners (i[t], j[t], k[t]). */
function pushTriangle(i: number[], j: number[], k: number[], a: number, b: number, c: number): void {
  i.push(a);
  j.push(b);
  k.push(c);
}

/** Empty mesh for safe fallbacks in catalog / UI. */
export function emptyMesh3d(): Mesh3dData {
  return { x: [], y: [], z: [], i: [], j: [], k: [] };
}

/** Axis-aligned box [x0,x1]×[y0,y1]×[z0,z1] (12 triangles). */
export function meshBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh3dData {
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const i: number[] = [];
  const j: number[] = [];
  const k: number[] = [];

  const corners: [number, number, number][] = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  for (const [a, b, c] of corners) {
    x.push(a);
    y.push(b);
    z.push(c);
  }
  // bottom z0: 0,1,2 and 0,2,3
  pushTriangle(i, j, k, 0, 1, 2);
  pushTriangle(i, j, k, 0, 2, 3);
  // top z1: 4,6,5 and 4,7,6
  pushTriangle(i, j, k, 4, 6, 5);
  pushTriangle(i, j, k, 4, 7, 6);
  // front y0: 0,5,1 and 0,4,5
  pushTriangle(i, j, k, 0, 5, 1);
  pushTriangle(i, j, k, 0, 4, 5);
  // back y1: 3,2,7 and 3,7,6
  pushTriangle(i, j, k, 3, 2, 7);
  pushTriangle(i, j, k, 3, 7, 6);
  // left x0: 0,3,7 and 0,7,4
  pushTriangle(i, j, k, 0, 3, 7);
  pushTriangle(i, j, k, 0, 7, 4);
  // right x1: 1,5,6 and 1,6,2
  pushTriangle(i, j, k, 1, 5, 6);
  pushTriangle(i, j, k, 1, 6, 2);

  return { x, y, z, i, j, k };
}

/** Same as meshBox with center (cx,cy,cz) and positive half-extents (hx,hy,hz). */
export function meshCuboid(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Mesh3dData {
  const ax = Math.abs(hx);
  const ay = Math.abs(hy);
  const az = Math.abs(hz);
  return meshBox(cx - ax, cy - ay, cz - az, cx + ax, cy + ay, cz + az);
}

/**
 * UV sphere centered at (cx,cy,cz), radius r.
 * phi: colatitude 0..pi (north pole to south); theta: azimuth 0..2pi.
 */
export function meshSphere(cx: number, cy: number, cz: number, radius: number, segments: number): Mesh3dData {
  const r = Math.abs(radius);
  const nu = clampInt(segments, 4, MESH_MAX_RADIAL_SEGMENTS);
  const nv = clampInt(Math.floor(segments / 2) + 2, 3, MESH_MAX_HEIGHT_SEGMENTS);
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const i: number[] = [];
  const j: number[] = [];
  const k: number[] = [];

  for (let iv = 0; iv <= nv; iv++) {
    const phi = (Math.PI * iv) / nv;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    for (let iu = 0; iu <= nu; iu++) {
      const theta = (2 * Math.PI * iu) / nu;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      x.push(cx + r * sp * ct);
      y.push(cy + r * sp * st);
      z.push(cz + r * cp);
    }
  }

  const stride = nu + 1;
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      pushTriangle(i, j, k, a, b, c);
      pushTriangle(i, j, k, a, c, d);
    }
  }

  return { x, y, z, i, j, k };
}

export type MeshCylinderOpts = {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  height: number;
  radialSegments?: number;
  heightSegments?: number;
  /** When false, open tube (no disks at ends). */
  caps?: boolean;
};

/** Right circular cylinder along +Z through (cx,cy,cz) ± height/2. */
export function meshCylinder(opts: MeshCylinderOpts): Mesh3dData {
  const {
    cx,
    cy,
    cz,
    radius: radIn,
    height: hIn,
    radialSegments: rsIn,
    heightSegments: hsIn,
    caps: capsIn = true,
  } = opts;
  const r = Math.abs(radIn);
  const h = Math.abs(hIn);
  const rs = clampInt(rsIn ?? 24, 3, MESH_MAX_RADIAL_SEGMENTS);
  const hs = clampInt(hsIn ?? 1, 1, MESH_MAX_HEIGHT_SEGMENTS);
  const caps = capsIn !== false;

  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const i: number[] = [];
  const j: number[] = [];
  const k: number[] = [];

  const z0 = cz - h / 2;
  const z1 = cz + h / 2;

  for (let row = 0; row <= hs; row++) {
    const t = hs <= 0 ? 0 : row / hs;
    const zv = z0 + (z1 - z0) * t;
    for (let k0 = 0; k0 < rs; k0++) {
      const theta = (2 * Math.PI * k0) / rs;
      x.push(cx + r * Math.cos(theta));
      y.push(cy + r * Math.sin(theta));
      z.push(zv);
    }
  }

  const ring = rs;
  for (let row = 0; row < hs; row++) {
    for (let k0 = 0; k0 < rs; k0++) {
      const k1 = (k0 + 1) % rs;
      const a = row * ring + k0;
      const b = row * ring + k1;
      const c = (row + 1) * ring + k1;
      const d = (row + 1) * ring + k0;
      pushTriangle(i, j, k, a, b, c);
      pushTriangle(i, j, k, a, c, d);
    }
  }

  if (caps && r > 0) {
    const baseIdx = x.length;
    // bottom center
    x.push(cx);
    y.push(cy);
    z.push(z0);
    const bottomCenter = baseIdx;
    for (let k0 = 0; k0 < rs; k0++) {
      const theta = (2 * Math.PI * k0) / rs;
      x.push(cx + r * Math.cos(theta));
      y.push(cy + r * Math.sin(theta));
      z.push(z0);
    }
    for (let k0 = 0; k0 < rs; k0++) {
      const v0 = bottomCenter + 1 + k0;
      const v1 = bottomCenter + 1 + ((k0 + 1) % rs);
      pushTriangle(i, j, k, bottomCenter, v1, v0);
    }

    const topBase = x.length;
    x.push(cx);
    y.push(cy);
    z.push(z1);
    const topCenter = topBase;
    for (let k0 = 0; k0 < rs; k0++) {
      const theta = (2 * Math.PI * k0) / rs;
      x.push(cx + r * Math.cos(theta));
      y.push(cy + r * Math.sin(theta));
      z.push(z1);
    }
    for (let k0 = 0; k0 < rs; k0++) {
      const v0 = topCenter + 1 + k0;
      const v1 = topCenter + 1 + ((k0 + 1) % rs);
      pushTriangle(i, j, k, topCenter, v0, v1);
    }
  }

  return { x, y, z, i, j, k };
}

export type MeshConeOpts = {
  cx: number;
  cy: number;
  cz: number;
  baseRadius: number;
  height: number;
  radialSegments?: number;
  /** Base at z = cz - h/2, apex at z = cz + h/2 */
  caps?: boolean;
};

/** Cone with circular base in plane z = cz - h/2 and apex at z = cz + h/2. */
export function meshCone(opts: MeshConeOpts): Mesh3dData {
  const {
    cx,
    cy,
    cz,
    baseRadius: brIn,
    height: hIn,
    radialSegments: rsIn,
    caps: capsIn = true,
  } = opts;
  const br = Math.abs(brIn);
  const h = Math.abs(hIn);
  const rs = clampInt(rsIn ?? 24, 3, MESH_MAX_RADIAL_SEGMENTS);
  const caps = capsIn !== false;

  const z0 = cz - h / 2;
  const z1 = cz + h / 2;

  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const i: number[] = [];
  const j: number[] = [];
  const k: number[] = [];

  // base ring + apex
  for (let k0 = 0; k0 < rs; k0++) {
    const theta = (2 * Math.PI * k0) / rs;
    x.push(cx + br * Math.cos(theta));
    y.push(cy + br * Math.sin(theta));
    z.push(z0);
  }
  const apexIdx = x.length;
  x.push(cx);
  y.push(cy);
  z.push(z1);

  for (let k0 = 0; k0 < rs; k0++) {
    const k1 = (k0 + 1) % rs;
    pushTriangle(i, j, k, k0, k1, apexIdx);
  }

  if (caps && br > 0) {
    const baseCenter = x.length;
    x.push(cx);
    y.push(cy);
    z.push(z0);
    for (let k0 = 0; k0 < rs; k0++) {
      const v0 = k0;
      const v1 = (k0 + 1) % rs;
      pushTriangle(i, j, k, baseCenter, v0, v1);
    }
  }

  return { x, y, z, i, j, k };
}

export type MeshTorusOpts = {
  cx: number;
  cy: number;
  cz: number;
  majorRadius: number;
  minorRadius: number;
  uSegments?: number;
  vSegments?: number;
};

/** Standard torus in XY plane, center (cx,cy,cz). */
export function meshTorus(opts: MeshTorusOpts): Mesh3dData {
  const { cx, cy, cz, majorRadius: Rin, minorRadius: rin, uSegments: usIn, vSegments: vsIn } = opts;
  const R = Math.abs(Rin);
  const r = Math.abs(rin);
  const nu = clampInt(usIn ?? 32, 4, MESH_MAX_TORUS_U);
  const nv = clampInt(vsIn ?? 24, 4, MESH_MAX_TORUS_V);

  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const i: number[] = [];
  const j: number[] = [];
  const k: number[] = [];

  for (let iv = 0; iv <= nv; iv++) {
    const v = (2 * Math.PI * iv) / nv;
    const cv = Math.cos(v);
    const sv = Math.sin(v);
    for (let iu = 0; iu <= nu; iu++) {
      const u = (2 * Math.PI * iu) / nu;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      const rr = R + r * cv;
      x.push(cx + rr * cu);
      y.push(cy + rr * su);
      z.push(cz + r * sv);
    }
  }

  const stride = nu + 1;
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      pushTriangle(i, j, k, a, b, c);
      pushTriangle(i, j, k, a, c, d);
    }
  }

  return { x, y, z, i, j, k };
}

export type MeshParametricUvOpts = {
  xExpression: string;
  yExpression: string;
  zExpression: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  uSteps: number;
  vSteps: number;
  scopeBase?: Record<string, number>;
};

/**
 * Parametric surface (u,v) → (x,y,z) via three mathjs expressions; sweep variables are `u` and `v`.
 */
export function meshParametricUv(opts: MeshParametricUvOpts): Mesh3dData {
  const nu = clampSurfaceSteps(opts.uSteps);
  const nv = clampSurfaceSteps(opts.vSteps);
  const uMin = opts.uMin;
  const uMax = opts.uMax;
  const vMin = opts.vMin;
  const vMax = opts.vMax;
  const xex = String(opts.xExpression ?? "0");
  const yex = String(opts.yExpression ?? "0");
  const zex = String(opts.zExpression ?? "0");
  const base = opts.scopeBase ?? {};

  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let iv = 0; iv <= nv; iv++) {
    const tv = nv <= 0 ? 0 : iv / nv;
    const v = vMin + (vMax - vMin) * tv;
    for (let iu = 0; iu <= nu; iu++) {
      const tu = nu <= 0 ? 0 : iu / nu;
      const u = uMin + (uMax - uMin) * tu;
      const scope = { ...base, u, v };
      const xv = evaluateMathExpression(xex, scope);
      const yv = evaluateMathExpression(yex, scope);
      const zv = evaluateMathExpression(zex, scope);
      x.push(Number.isFinite(xv) ? xv : 0);
      y.push(Number.isFinite(yv) ? yv : 0);
      z.push(Number.isFinite(zv) ? zv : 0);
    }
  }

  const stride = nu + 1;
  const i: number[] = [];
  const j: number[] = [];
  const k: number[] = [];
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      pushTriangle(i, j, k, a, b, c);
      pushTriangle(i, j, k, a, c, d);
    }
  }

  return { x, y, z, i, j, k };
}

/** Concatenate meshes; triangle indices in `b` are offset by vertex count of `a`. */
export function meshMerge(a: Mesh3dData, b: Mesh3dData): Mesh3dData {
  const off = a.x.length;
  return {
    x: [...a.x, ...b.x],
    y: [...a.y, ...b.y],
    z: [...a.z, ...b.z],
    i: [...a.i, ...b.i.map((v) => v + off)],
    j: [...a.j, ...b.j.map((v) => v + off)],
    k: [...a.k, ...b.k.map((v) => v + off)],
  };
}

/** Merge many meshes in order. */
export function meshMergeMany(meshes: readonly Mesh3dData[]): Mesh3dData {
  if (meshes.length === 0) return emptyMesh3d();
  let acc = { ...meshes[0]!, x: [...meshes[0]!.x], y: [...meshes[0]!.y], z: [...meshes[0]!.z], i: [...meshes[0]!.i], j: [...meshes[0]!.j], k: [...meshes[0]!.k] };
  for (let m = 1; m < meshes.length; m++) {
    acc = meshMerge(acc, meshes[m]!);
  }
  return acc;
}

/** Count triangles (i,j,k are parallel; length = number of triangles). */
export function meshTriangleCount(m: Mesh3dData): number {
  return m.i.length;
}

/** Max vertex index referenced by triangles. */
export function meshMaxVertexIndex(m: Mesh3dData): number {
  let mx = -1;
  for (let t = 0; t < m.i.length; t++) {
    mx = Math.max(mx, m.i[t]!, m.j[t]!, m.k[t]!);
  }
  return mx;
}
