import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { A2UI_V09_HOST_CATALOG_JSON_URL } from "../../shared/a2ui-v0_9-constants";
import type { A2uiClientAction } from "@a2ui/web_core/v0_9/schema/client-to-server.js";
import { buildA2uiV09HostCatalog } from "./a2ui-v0_9-host-catalog";

/**
 * Singleton v0.9 message processor for renderer surfaces.
 * Holds all A2UI surfaces (chat + modal + future panels) in one registry.
 */
class A2uiV09Runtime {
  readonly processor: any;

  constructor() {
    const catalog = buildA2uiV09HostCatalog();
    this.processor = new MessageProcessor([catalog], (action: A2uiClientAction) => {
      try {
        window.dispatchEvent(new CustomEvent("a2ui-v0_9-action", { detail: action }));
      } catch {
        /* ignore */
      }
    });

    // Keep common dashboard stats up-to-date for todo-like surfaces.
    this.processor.onSurfaceCreated((surface: any) => {
      ensureTodoStatsHook(surface);
    });
  }

  getCatalogId(): string {
    return A2UI_V09_HOST_CATALOG_JSON_URL;
  }

  processMessages(messages: unknown[]): void {
    this.processor.processMessages(messages);
  }

  getSurface(surfaceId: string): unknown {
    return this.processor.model.getSurface(surfaceId);
  }
}

let runtime: A2uiV09Runtime | null = null;

export function getA2uiV09Runtime(): A2uiV09Runtime {
  if (!runtime) runtime = new A2uiV09Runtime();
  return runtime;
}

const todoStatsHookedSurfaceIds = new Set<string>();
const compoundHookedSurfaceIds = new Set<string>();
const kanbanHookedSurfaceIds = new Set<string>();

function computeTodoStats(surface: any): void {
  const tasks = surface?.dataModel?.get?.("/tasks");
  const arr = Array.isArray(tasks) ? tasks : [];
  let completed = 0;
  for (const t of arr) {
    if (t && typeof t === "object" && (t as any).done === true) completed++;
  }
  const total = arr.length;
  const stats = {
    total,
    completed,
    pending: Math.max(0, total - completed),
  };
  surface?.dataModel?.set?.("/stats", stats);
  // Do not write `/statsText` here: that path is a common binding for human-readable strings
  // (e.g. search result counts). Writing an object would crash Text renders and take down the shell.
}

export function ensureTodoStatsHook(surface: any): void {
  const id = String(surface?.id ?? "").trim();
  if (!id || todoStatsHookedSurfaceIds.has(id)) return;
  todoStatsHookedSurfaceIds.add(id);
  try {
    surface?.dataModel?.subscribe?.("/tasks", () => computeTodoStats(surface));
    computeTodoStats(surface);
  } catch {
    /* ignore */
  }
}

function safeNum(x: unknown, fallback: number): number {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number.parseFloat(x.trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function formatMoney(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function buildSparklineSvg(series: number[]): string {
  const w = 720;
  const h = 220;
  const padX = 18;
  const padY = 18;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(1e-9, max - min);

  const pts = series
    .map((v, i) => {
      const x = padX + (innerW * i) / Math.max(1, series.length - 1);
      const y = padY + innerH * (1 - (v - min) / span);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const grid = [0.25, 0.5, 0.75]
    .map((t) => {
      const y = padY + innerH * t;
      return `<line x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(124, 92, 255, 0.35)"/>
      <stop offset="1" stop-color="rgba(124, 92, 255, 0)"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="rgba(18,18,26,0.55)"/>
  ${grid}
  <polyline points="${pts}" fill="none" stroke="rgba(124, 92, 255, 0.95)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)"/>
  <polyline points="${pts} ${w - padX},${h - padY} ${padX},${h - padY}" fill="url(#g)" stroke="none"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function computeCompound(surface: any): void {
  const dm = surface?.dataModel;
  if (!dm) return;
  const p = clamp(safeNum(dm.get("/ci/p"), 1000), 0, 1e9);
  const ratePct = clamp(safeNum(dm.get("/ci/rPct"), 5), 0, 100);
  const years = clamp(Math.round(safeNum(dm.get("/ci/years"), 10)), 0, 60);
  const n = clamp(Math.round(safeNum(dm.get("/ci/n"), 12)), 1, 365);
  const r = ratePct / 100;

  // High-resolution samples so LineChart shows a smooth "snowball" curve (not yearly steps only).
  const yearly: number[] = [];
  for (let y = 0; y <= years; y++) {
    yearly.push(p * Math.pow(1 + r / n, n * y));
  }
  const chartSteps = Math.min(
    200,
    Math.max(24, Math.ceil(years * 48) || 24)
  );
  const series: number[] = [];
  for (let i = 0; i <= chartSteps; i++) {
    const t = years * (i / chartSteps);
    const fv = p * Math.pow(1 + r / n, n * t);
    series.push(fv);
  }
  const fv = yearly[yearly.length - 1] ?? p;
  const interest = fv - p;
  const chartUrl = buildSparklineSvg(series);

  dm.set("/ci/out", {
    fv,
    interest,
    chartUrl,
    fvText: formatMoney(fv),
    interestText: formatMoney(interest),
    /** Y values for LineChart / `series_expr`-style bindings (smooth curve). */
    series,
    /** One point per whole year (table / discrete readouts). */
    seriesYearly: yearly,
  });
}

export function ensureCompoundInterestHook(surface: any): void {
  const id = String(surface?.id ?? "").trim();
  if (!id || compoundHookedSurfaceIds.has(id)) return;
  compoundHookedSurfaceIds.add(id);
  try {
    // Recompute whenever any of these change.
    const paths = ["/ci/p", "/ci/rPct", "/ci/years", "/ci/n"];
    for (const p of paths) {
      surface?.dataModel?.subscribe?.(p, () => computeCompound(surface));
    }
    computeCompound(surface);
  } catch {
    /* ignore */
  }
}

function computeKanbanStats(surface: any): void {
  const dm = surface?.dataModel;
  if (!dm) return;
  const cards = dm.get("/cards");
  const arr = Array.isArray(cards) ? cards : [];
  let doneCards = 0;
  let totalPoints = 0;
  let donePoints = 0;
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const pointsRaw = (c as any).points;
    const p = typeof pointsRaw === "number" ? pointsRaw : typeof pointsRaw === "string" ? Number.parseFloat(pointsRaw) : 0;
    if (Number.isFinite(p)) totalPoints += p;
    const lane = String((c as any).lane ?? "");
    const done = (c as any).done === true || lane.toLowerCase() === "done";
    if (done) {
      doneCards++;
      if (Number.isFinite(p)) donePoints += p;
    }
  }
  dm.set("/kanbanStats", {
    totalCards: arr.length,
    doneCards,
    totalPoints,
    donePoints,
  });
  // Append donePoints to trend for sparkline.
  const trend = dm.get("/trendDonePoints");
  const series = Array.isArray(trend) ? trend.slice() : [];
  series.push(donePoints);
  while (series.length > 24) series.shift();
  dm.set("/trendDonePoints", series);
}

export function ensureKanbanHook(surface: any): void {
  const id = String(surface?.id ?? "").trim();
  if (!id || kanbanHookedSurfaceIds.has(id)) return;
  kanbanHookedSurfaceIds.add(id);
  try {
    surface?.dataModel?.subscribe?.("/cards", () => computeKanbanStats(surface));
    computeKanbanStats(surface);
  } catch {
    /* ignore */
  }
}

