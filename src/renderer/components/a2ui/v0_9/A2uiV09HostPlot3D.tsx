import { useEffect, useMemo, useRef, useState } from "react";
import { createReactComponent } from "@a2ui/react/v0_9";
import { Plot3DApi } from "./a2ui-v0_9-plot3d-types";
import { isDynamicLeaf, resolveNumArray } from "./a2ui-v0_9-chart-data-resolve";

type Plot3DProps = {
  title?: unknown;
  kind?: "surface" | "scatter";
  surface?: unknown;
  points?: unknown;
  traces?: unknown;
  heightPx?: number;
  weight?: number;
  axisRangeMode?: "auto" | "symmetric";
};

const MAX_MULTITRACES = 24;

/** Each axis [-R,R] with R = max absolute coordinate (shows all octants when data is one-sided). */
function symmetricAxisRange(values: number[]): [number, number] | undefined {
  const finite = values.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (finite.length === 0) return undefined;
  const r = Math.max(1e-9, ...finite.map((v) => Math.abs(v)));
  return [-r, r];
}

/**
 * Resolves a dynamic leaf. Supports `functionCall` + string `path` when `path` does not start with `/`
 * (property on the catalog result, e.g. `x` from `mesh_sphere`), which some models emit per mesh field.
 */
function resolveAny(raw: unknown, dc: any): unknown {
  if (!isDynamicLeaf(raw)) return raw;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.call === "string" &&
    typeof o.path === "string" &&
    o.path.length > 0 &&
    !o.path.startsWith("/")
  ) {
    const { path: prop, ...callOnly } = o;
    const base = dc?.resolveDynamicValue?.(callOnly);
    if (base != null && typeof base === "object" && prop in (base as object)) {
      return (base as Record<string, unknown>)[prop];
    }
    return undefined;
  }
  return dc?.resolveDynamicValue?.(raw) ?? undefined;
}

/** Subscribe using the same identity the catalog binder uses (strip result-property `path`). */
function normalizeDynamicLeafForSubscribe(raw: unknown): unknown {
  if (!isDynamicLeaf(raw)) return raw;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.call === "string" &&
    typeof o.path === "string" &&
    o.path.length > 0 &&
    !o.path.startsWith("/")
  ) {
    const { path: _p, ...rest } = o;
    return rest;
  }
  return raw;
}

function dedupeSubscribeLeaves(leaves: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const leaf of leaves) {
    const n = normalizeDynamicLeafForSubscribe(leaf);
    let key: string;
    try {
      key = JSON.stringify(n);
    } catch {
      key = String(n);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function resolveNumArrayWithDc(raw: unknown, dc: any): number[] {
  return resolveNumArray(resolveAny(raw, dc));
}

function collectDynamicLeavesDeep(v: unknown, out: unknown[]): void {
  if (isDynamicLeaf(v)) {
    out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const e of v) collectDynamicLeavesDeep(e, out);
    return;
  }
  if (v && typeof v === "object") {
    for (const val of Object.values(v as Record<string, unknown>)) collectDynamicLeavesDeep(val, out);
  }
}

function resolvePoints(raw: unknown): Array<{ x: number; y: number; z: number; label?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ x: number; y: number; z: number; label?: string }> = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const x = (p as any).x;
    const y = (p as any).y;
    const z = (p as any).z;
    const xn = typeof x === "number" ? x : Number(x);
    const yn = typeof y === "number" ? y : Number(y);
    const zn = typeof z === "number" ? z : Number(z);
    if (!Number.isFinite(xn) || !Number.isFinite(yn) || !Number.isFinite(zn)) continue;
    const label = (p as any).label;
    out.push({ x: xn, y: yn, z: zn, ...(typeof label === "string" ? { label } : {}) });
  }
  return out;
}

function resolveSurface(raw: unknown, dc: any): { x: number[]; y: number[]; z: number[][] } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as any;
  const x = resolveNumArrayWithDc(o.x, dc);
  const y = resolveNumArrayWithDc(o.y, dc);
  const zRaw = resolveAny(o.z, dc);
  const z: number[][] = Array.isArray(zRaw)
    ? zRaw.map((row: unknown) => resolveNumArray(resolveAny(row, dc))).filter((r: number[]) => r.length > 0)
    : [];
  if (x.length < 2 || y.length < 2 || z.length < 2) return null;
  return { x, y, z };
}

type Mesh3dResolved = { x: number[]; y: number[]; z: number[]; i: number[]; j: number[]; k: number[] };

function isMesh3dPayload(o: unknown): o is Mesh3dResolved {
  if (!o || typeof o !== "object") return false;
  const m = o as Record<string, unknown>;
  return (
    Array.isArray(m.x) &&
    Array.isArray(m.y) &&
    Array.isArray(m.z) &&
    Array.isArray(m.i) &&
    Array.isArray(m.j) &&
    Array.isArray(m.k)
  );
}

function validateMeshArrays(
  x: number[],
  y: number[],
  z: number[],
  ri: number[],
  rj: number[],
  rk: number[],
): Mesh3dResolved | null {
  if (x.length === 0 || x.length !== y.length || y.length !== z.length) return null;
  if (ri.length === 0 || ri.length !== rj.length || rj.length !== rk.length) return null;
  const maxI = x.length - 1;
  const valid = ri.every((a, idx) => {
    const b = rj[idx]!;
    const c = rk[idx]!;
    return a >= 0 && b >= 0 && c >= 0 && a <= maxI && b <= maxI && c <= maxI;
  });
  if (!valid) return null;
  return { x, y, z, i: ri, j: rj, k: rk };
}

/** Plain `{ x,y,z,i,j,k }` after catalog or model materialization (no nested `{path}` in arrays). */
function meshFromPlainPayload(o: unknown): Mesh3dResolved | null {
  if (!isMesh3dPayload(o)) return null;
  const m = o as Mesh3dResolved;
  return validateMeshArrays(
    resolveNumArray(m.x),
    resolveNumArray(m.y),
    resolveNumArray(m.z),
    resolveNumArray(m.i).map((n) => Math.floor(n)),
    resolveNumArray(m.j).map((n) => Math.floor(n)),
    resolveNumArray(m.k).map((n) => Math.floor(n)),
  );
}

/**
 * Mesh trace: full `mesh_*` object on `mesh`, on `x`, or split x/y/z/i/j/k bindings (original behavior).
 */
function resolveMeshTracePayload(t: any, dc: any): Mesh3dResolved | null {
  const meshSlot = t?.mesh;
  if (meshSlot != null) {
    const r = resolveAny(meshSlot, dc);
    const m = meshFromPlainPayload(r);
    if (m) return m;
  }
  const xSlot = t?.x;
  if (xSlot !== undefined && xSlot !== null) {
    const xVal = isDynamicLeaf(xSlot) ? resolveAny(xSlot, dc) : xSlot;
    const m = meshFromPlainPayload(xVal);
    if (m) return m;
  }
  return resolveMesh(t, dc);
}

function resolveMesh(raw: unknown, dc: any): Mesh3dResolved | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as any;
  const x = resolveNumArrayWithDc(o.x, dc);
  const y = resolveNumArrayWithDc(o.y, dc);
  const z = resolveNumArrayWithDc(o.z, dc);
  const ri = resolveNumArrayWithDc(o.i, dc).map((n) => Math.floor(n));
  const rj = resolveNumArrayWithDc(o.j, dc).map((n) => Math.floor(n));
  const rk = resolveNumArrayWithDc(o.k, dc).map((n) => Math.floor(n));
  return validateMeshArrays(x, y, z, ri, rj, rk);
}

function asStringResolved(v: unknown, dc: any): string | undefined {
  const r = resolveAny(v, dc);
  if (r == null) return undefined;
  const s = typeof r === "string" ? r : String(r);
  const t = s.trim();
  return t.length ? t : undefined;
}

type ResolvedMultiSurface = {
  traceType: "surface";
  surface: { x: number[]; y: number[]; z: number[][] };
  name?: string;
  opacity?: number;
};

type ResolvedMultiScatter = {
  traceType: "scatter";
  points: Array<{ x: number; y: number; z: number; label?: string }>;
  name?: string;
  opacity?: number;
  markerSize?: number;
};

type ResolvedMultiMesh = {
  traceType: "mesh";
  mesh: Mesh3dResolved;
  name?: string;
  opacity?: number;
};

export type Plot3DResolvedTrace = ResolvedMultiSurface | ResolvedMultiScatter | ResolvedMultiMesh;

/** Exported for unit tests — resolves `traces` prop including dynamic bindings when `dc` is set. */
export function resolveMultiTraces(tracesProp: unknown, dc: any): Plot3DResolvedTrace[] | null {
  let arr = tracesProp;
  if (isDynamicLeaf(arr)) arr = dc?.resolveDynamicValue?.(arr);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out: Plot3DResolvedTrace[] = [];
  const n = Math.min(arr.length, MAX_MULTITRACES);
  for (let idx = 0; idx < n; idx++) {
    let t = arr[idx];
    if (isDynamicLeaf(t)) t = dc?.resolveDynamicValue?.(t);
    if (!t || typeof t !== "object") continue;
    const traceType = (t as any).traceType;
    if (traceType === "surface") {
      const surface = resolveSurface(t, dc);
      if (!surface) continue;
      const op = (t as any).opacity;
      const opacity =
        typeof op === "number" && Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : undefined;
      const name = asStringResolved((t as any).name, dc);
      out.push({
        traceType: "surface",
        surface,
        ...(name ? { name } : {}),
        ...(opacity !== undefined ? { opacity } : {}),
      });
    } else if (traceType === "scatter") {
      const ptsRaw = resolveAny((t as any).points, dc);
      const points = resolvePoints(ptsRaw);
      if (points.length === 0) continue;
      const op = (t as any).opacity;
      const opacity =
        typeof op === "number" && Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : undefined;
      const ms = (t as any).markerSize;
      const markerSize =
        typeof ms === "number" && Number.isFinite(ms) ? Math.min(16, Math.max(0.5, ms)) : undefined;
      const name = asStringResolved((t as any).name, dc);
      out.push({
        traceType: "scatter",
        points,
        ...(name ? { name } : {}),
        ...(opacity !== undefined ? { opacity } : {}),
        ...(markerSize !== undefined ? { markerSize } : {}),
      });
    } else if (traceType === "mesh") {
      const mesh = resolveMeshTracePayload(t, dc);
      if (!mesh) continue;
      const op = (t as any).opacity;
      const opacity =
        typeof op === "number" && Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : undefined;
      const name = asStringResolved((t as any).name, dc);
      out.push({
        traceType: "mesh",
        mesh,
        ...(name ? { name } : {}),
        ...(opacity !== undefined ? { opacity } : {}),
      });
    }
  }
  return out.length > 0 ? out : null;
}

function coordsFromMulti(traces: Plot3DResolvedTrace[]): { xs: number[]; ys: number[]; zs: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const tr of traces) {
    if (tr.traceType === "surface") {
      xs.push(...tr.surface.x);
      ys.push(...tr.surface.y);
      zs.push(...tr.surface.z.flat());
    } else if (tr.traceType === "scatter") {
      for (const p of tr.points) {
        xs.push(p.x);
        ys.push(p.y);
        zs.push(p.z);
      }
    } else {
      xs.push(...tr.mesh.x);
      ys.push(...tr.mesh.y);
      zs.push(...tr.mesh.z);
    }
  }
  return { xs, ys, zs };
}

export const a2uiV09HostPlot3D = createReactComponent(Plot3DApi as any, ({ props, context }) => {
  const p = props as Plot3DProps;
  const dc = (context as any)?.dataContext;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const plotlyRef = useRef<any>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!dc) return;
    const leaves: unknown[] = [];
    if (isDynamicLeaf(p.surface)) leaves.push(p.surface);
    if (isDynamicLeaf(p.points)) leaves.push(p.points);
    if (isDynamicLeaf(p.traces)) leaves.push(p.traces);
    if (Array.isArray(p.traces)) collectDynamicLeavesDeep(p.traces, leaves);
    if (leaves.length === 0) return;
    const deduped = dedupeSubscribeLeaves(leaves);
    const subs = deduped.map((leaf) =>
      dc.subscribeDynamicValue?.(leaf, () => setTick((t) => t + 1)),
    );
    return () => subs.forEach((s: any) => s?.unsubscribe?.());
  }, [dc, p.surface, p.points, p.traces]);

  const dataResolved = useMemo(() => {
    void tick;
    const hadTracesProp =
      isDynamicLeaf(p.traces) || (Array.isArray(p.traces) && p.traces.length > 0);
    const multi = resolveMultiTraces(p.traces, dc);
    if (multi && multi.length > 0) {
      return { useMulti: true as const, traces: multi };
    }
    if (hadTracesProp) {
      return {
        useMulti: true as const,
        traces: [
          {
            traceType: "scatter" as const,
            points: [
              {
                x: 0,
                y: 0,
                z: 0,
                label:
                  "Invalid Plot3D traces (check mesh fields). mesh_sphere: radius + optional cx,cy,cz + segments or widthSegments/heightSegments.",
              },
            ],
          },
        ],
      };
    }
    const kind = p.kind ?? "surface";
    if (kind === "scatter") {
      const pts = resolveAny(p.points, dc);
      const points = resolvePoints(pts);
      return { useMulti: false as const, kind, points, surface: null };
    }
    const s0 = resolveAny(p.surface, dc);
    const surface = resolveSurface(s0, dc);
    return { useMulti: false as const, kind, surface, points: [] };
  }, [dc, p.kind, p.points, p.surface, p.traces, tick]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    const height = typeof p.heightPx === "number" ? p.heightPx : 420;
    const title = typeof p.title === "string" ? p.title : "";

    const layout: any = {
      title: title ? { text: title, font: { size: 14, color: "var(--text)" } } : undefined,
      height,
      margin: { l: 10, r: 10, t: title ? 36 : 10, b: 10 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      scene: {
        xaxis: { title: "x", color: "var(--text2)" as any },
        yaxis: { title: "y", color: "var(--text2)" as any },
        zaxis: { title: "z", color: "var(--text2)" as any },
        bgcolor: "transparent",
      },
      showlegend: false,
    };

    const axisRangeMode = p.axisRangeMode ?? "auto";
    if (axisRangeMode === "symmetric") {
      let xs: number[] = [];
      let ys: number[] = [];
      let zs: number[] = [];
      if (dataResolved.useMulti) {
        const c = coordsFromMulti(dataResolved.traces);
        xs = c.xs;
        ys = c.ys;
        zs = c.zs;
      } else if (dataResolved.kind === "scatter") {
        const pts = dataResolved.points as Array<{ x: number; y: number; z: number }>;
        xs = pts.map((q) => q.x);
        ys = pts.map((q) => q.y);
        zs = pts.map((q) => q.z);
      } else {
        const surface = dataResolved.surface as { x: number[]; y: number[]; z: number[][] } | null;
        if (surface) {
          xs = surface.x;
          ys = surface.y;
          zs = surface.z.flat();
        }
      }
      const xr = symmetricAxisRange(xs);
      const yr = symmetricAxisRange(ys);
      const zr = symmetricAxisRange(zs);
      if (xr) layout.scene.xaxis = { ...layout.scene.xaxis, range: xr };
      if (yr) layout.scene.yaxis = { ...layout.scene.yaxis, range: yr };
      if (zr) layout.scene.zaxis = { ...layout.scene.zaxis, range: zr };
    }

    const config: any = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ["toImage"],
    };

    const traces: any[] = [];

    if (dataResolved.useMulti) {
      const mtr = dataResolved.traces;
      let showscaleAssigned = false;
      const named = mtr.filter((t) => (t.name ?? "").trim().length > 0);
      layout.showlegend = named.length > 1;

      for (const tr of mtr) {
        const nm = (tr.name ?? "").trim();
        if (tr.traceType === "surface") {
          const showscale = !showscaleAssigned;
          showscaleAssigned = true;
          traces.push({
            type: "surface",
            x: tr.surface.x,
            y: tr.surface.y,
            z: tr.surface.z,
            name: nm,
            opacity: tr.opacity,
            showscale,
          } as any);
        } else if (tr.traceType === "scatter") {
          traces.push({
            type: "scatter3d",
            mode: "markers",
            x: tr.points.map((q) => q.x),
            y: tr.points.map((q) => q.y),
            z: tr.points.map((q) => q.z),
            text: tr.points.map((q) => q.label ?? ""),
            name: nm,
            opacity: tr.opacity,
            marker: { size: tr.markerSize ?? 3.5, color: "var(--accent)" as any },
          } as any);
        } else {
          traces.push({
            type: "mesh3d",
            x: tr.mesh.x,
            y: tr.mesh.y,
            z: tr.mesh.z,
            i: tr.mesh.i,
            j: tr.mesh.j,
            k: tr.mesh.k,
            alphahull: 0,
            flatshading: true,
            name: nm,
            opacity: tr.opacity ?? 1,
            /** Plotly WebGL ignores many CSS `var()` colors; use opaque RGB aligned with host accent. */
            color: "rgb(124, 92, 255)",
          } as any);
        }
      }
      if (traces.length === 0) {
        traces.push({
          type: "scatter3d",
          mode: "text",
          x: [0],
          y: [0],
          z: [0],
          text: ["(no valid traces)"],
          textfont: { color: "var(--text2)" as any, size: 12 },
        } as any);
      }
    } else if (dataResolved.kind === "scatter") {
      const points = dataResolved.points as Array<{ x: number; y: number; z: number; label?: string }>;
      traces.push({
        type: "scatter3d",
        mode: "markers",
        x: points.map((q) => q.x),
        y: points.map((q) => q.y),
        z: points.map((q) => q.z),
        text: points.map((q) => q.label ?? ""),
        marker: { size: 3.5, color: "var(--accent)" as any },
      });
    } else {
      const surface = dataResolved.surface as { x: number[]; y: number[]; z: number[][] } | null;
      if (surface) {
        traces.push({
          type: "surface",
          x: surface.x,
          y: surface.y,
          z: surface.z,
          showscale: true,
        } as any);
      } else {
        traces.push({
          type: "scatter3d",
          mode: "text",
          x: [0],
          y: [0],
          z: [0],
          text: ["(missing surface data)"],
          textfont: { color: "var(--text2)" as any, size: 12 },
        } as any);
      }
    }

    const run = async () => {
      if (!plotlyRef.current) {
        const mod: any = await import("plotly.js-dist-min");
        plotlyRef.current = mod?.default ?? mod;
      }
      if (cancelled) return;
      const Plotly = plotlyRef.current;
      void Plotly.react(el, traces, layout as any, config as any);
    };
    void run();
    return () => {
      cancelled = true;
      try {
        const Plotly = plotlyRef.current;
        if (Plotly) void Plotly.purge(el);
      } catch {
        /* ignore */
      }
    };
  }, [dataResolved, p.heightPx, p.title, p.axisRangeMode]);

  return (
    <div
      ref={rootRef}
      style={{
        width: "100%",
        height: typeof p.heightPx === "number" ? p.heightPx : 420,
        minHeight: 180,
        borderRadius: "var(--a2ui-host-radius-lg)",
        border: "1px solid var(--a2ui-host-border-subtle)",
        background: "var(--a2ui-host-surface-2)",
        overflow: "hidden",
      }}
    />
  );
});
