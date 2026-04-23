/**
 * Host A2UI v0.9 chart components (Recharts + theme tokens in `style-a2ui-host-tokens.css`).
 */
import { useMemo, type CSSProperties, type ReactElement, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as ReLineChart,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createReactComponent } from "@a2ui/react/v0_9";
import {
  AreaChartApi,
  BarChartApi,
  DensityPlotApi,
  HistogramApi,
  LineChartApi,
  PieChartApi,
} from "./a2ui-v0_9-chart-types";
import { a2uiV09HostPlot3D } from "./A2uiV09HostPlot3D";
import {
  asString,
  resolveNumArray,
  useCartesianChartResolvedData,
  type ChartDataContextLike,
  type SeriesRow,
} from "./a2ui-v0_9-chart-data-resolve";
import {
  denseCategoryAxisProps,
  formatCartesianTick,
  numericAxisDomainFromValues,
  yDomainForLineArea,
  yDomainNonNegativeIfAllPositive,
} from "./a2ui-v0_9-chart-axis-helpers";

const MAX_POINTS = 500;
/** Left inset so Y-axis tick labels (especially compact large values) do not clip. */
const CARTESIAN_MARGIN_LEFT = 14;
/** Distinct theme slots in `style-a2ui-host-tokens.css` (`--a2ui-host-chart-series-0` …). */
const CHART_SERIES_SLOTS = 8;

function seriesCssVar(i: number): string {
  return `var(--a2ui-host-chart-series-${i % CHART_SERIES_SLOTS}, var(--accent))`;
}

const chartTooltipContentStyle: CSSProperties = {
  background: "var(--a2ui-host-chart-tooltip-bg)",
  border: "1px solid var(--a2ui-host-chart-tooltip-border)",
  borderRadius: "var(--a2ui-host-radius-md)",
  color: "var(--a2ui-host-chart-tooltip-color)",
  boxShadow: "var(--a2ui-host-shadow-raised)",
};

const chartTickSmall = { fill: "var(--a2ui-host-chart-axis-tick, var(--text2))", fontSize: 11 };
const chartTickHist = { fill: "var(--a2ui-host-chart-axis-tick, var(--text2))", fontSize: 9 };

/** Recharts sometimes paints a non-transparent surface behind cartesian/pie SVGs. */
const chartSvgRootStyle: CSSProperties = { background: "transparent" };

function pieSectorLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  name?: string;
}): ReactElement | null {
  const cx = props.cx ?? 0;
  const cy = props.cy ?? 0;
  const midAngle = props.midAngle ?? 0;
  const innerRadius = props.innerRadius ?? 0;
  const outerRadius = props.outerRadius ?? 1;
  const pct = props.percent ?? 0;
  const name = props.name ?? "";
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.62;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="var(--text)"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10.5}
    >
      {`${name} ${(pct * 100).toFixed(0)}%`}
    </text>
  );
}

function resolvePieSegments(raw: unknown): { label: string; value: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; value: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = asString((item as { label?: unknown }).label);
    const v = (item as { value?: unknown }).value;
    const value = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
    if (label && Number.isFinite(value)) out.push({ label, value });
  }
  return out;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return Math.sqrt(mean(nums.map((x) => (x - m) ** 2)));
}

/** Histogram bin edges and counts. */
function histogramBins(samples: number[], binCount: number, normalize: "count" | "density"): { name: string; v: number }[] {
  const nums = samples.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (nums.length === 0) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(1e-9, max - min);
  const counts = new Array(binCount).fill(0);
  for (const v of nums) {
    const t = (v - min) / span;
    const bi = Math.min(binCount - 1, Math.floor(t * binCount));
    counts[bi]++;
  }
  const total = nums.length;
  const binW = span / binCount;
  return counts.map((c, i) => {
    const lo = min + i * binW;
    const hi = min + (i + 1) * binW;
    const name = `${lo.toPrecision(3)}–${hi.toPrecision(3)}`;
    const v =
      normalize === "count" ? c : c / Math.max(1e-9, total * binW);
    return { name, v };
  });
}

/** Simple Gaussian KDE for display. */
function kdePoints(samples: number[], steps = 64): { x: number; y: number }[] {
  const nums = samples.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (nums.length === 0) return [];
  const n = nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(1e-9, max - min);
  const h = Math.max(1e-6, 1.06 * stddev(nums) * Math.pow(n, -0.2));
  const pad = span * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const step = (hi - lo) / steps;
  const pts: { x: number; y: number }[] = [];
  const inv = 1 / (n * h * Math.sqrt(2 * Math.PI));
  for (let x = lo; x <= hi; x += step) {
    let sum = 0;
    for (const xi of nums) {
      const z = (x - xi) / h;
      sum += Math.exp(-0.5 * z * z);
    }
    pts.push({ x, y: sum * inv });
  }
  return pts;
}

function buildCartesianRows(
  categoriesIn: string[] | undefined,
  series: SeriesRow[]
): { rows: Record<string, string | number>[]; keys: string[] } {
  const maxLen = Math.max(0, ...series.map((s) => s.values.length));
  const categories =
    categoriesIn && categoriesIn.length > 0
      ? categoriesIn.slice(0, MAX_POINTS)
      : Array.from({ length: Math.min(maxLen, MAX_POINTS) }, (_, i) => String(i));
  const keys = series.map((_, i) => `s${i}`);
  const len = Math.min(categories.length, maxLen, MAX_POINTS);
  const rows: Record<string, string | number>[] = [];
  for (let i = 0; i < len; i++) {
    const row: Record<string, string | number> = { name: categories[i] ?? String(i) };
    for (let j = 0; j < series.length; j++) {
      row[keys[j]] = series[j].values[i] ?? 0;
    }
    rows.push(row);
  }
  return { rows, keys };
}

function parseCategoriesAsNumericX(categories: string[] | undefined, len: number): number[] {
  if (!categories || categories.length === 0) {
    return Array.from({ length: len }, (_, i) => i);
  }
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const raw = categories[i] ?? String(i);
    const n = Number.parseFloat(String(raw).trim());
    out.push(Number.isFinite(n) ? n : i);
  }
  return out;
}

/** Rows for Recharts numeric X (`xNum`); `name` kept for tooltips. */
function buildCartesianRowsNumeric(
  xNums: number[],
  series: SeriesRow[]
): { rows: Record<string, string | number>[]; keys: string[] } {
  const maxLen = Math.max(0, ...series.map((s) => s.values.length));
  const keys = series.map((_, i) => `s${i}`);
  const len = Math.min(xNums.length, maxLen, MAX_POINTS);
  const rows: Record<string, string | number>[] = [];
  for (let i = 0; i < len; i++) {
    const xv = xNums[i] ?? 0;
    const row: Record<string, string | number> = {
      xNum: xv,
      name: String(xv),
    };
    for (let j = 0; j < series.length; j++) {
      row[keys[j]] = series[j].values[i] ?? 0;
    }
    rows.push(row);
  }
  return { rows, keys };
}

function ChartFrame(props: {
  title?: unknown;
  heightPx: number;
  children: ReactNode;
  className?: string;
  ariaLabel: string;
}): ReactElement {
  const title = asString(props.title);
  return (
    <div className={`a2ui-host-chart ${props.className ?? ""}`.trim()} role="img" aria-label={props.ariaLabel}>
      {title ? <div className="a2ui-host-chart__title">{title}</div> : null}
      <div className="a2ui-host-chart__plot" style={{ height: props.heightPx }}>
        {props.children}
      </div>
    </div>
  );
}

function legendProps(pos: string): { verticalAlign?: "top" | "bottom" | "middle"; align?: "left" | "right" | "center" } {
  switch (pos) {
    case "top":
      return { verticalAlign: "top", align: "center" };
    case "bottom":
      return { verticalAlign: "bottom", align: "center" };
    case "left":
      return { verticalAlign: "middle", align: "left" };
    case "right":
      return { verticalAlign: "middle", align: "right" };
    default:
      return { verticalAlign: "bottom", align: "center" };
  }
}

export const a2uiV09HostLineChart = createReactComponent(LineChartApi as any, ({ props, context }) => {
  const xMode = props.xMode ?? "category";
  const includeZeroOnY = props.includeZeroOnY !== false;
  const { series, categories: categoriesResolved, xValuesNum } = useCartesianChartResolvedData(
    props.series,
    props.categories,
    props.xValues,
    context as { dataContext: ChartDataContextLike } | undefined,
  );
  const categories = categoriesResolved;
  const { rows, keys } = useMemo(() => {
    if (xMode === "number") {
      const maxLen = Math.max(0, ...series.map((s) => s.values.length));
      const xNums =
        xValuesNum && xValuesNum.length > 0
          ? xValuesNum
          : parseCategoriesAsNumericX(categories, maxLen);
      return buildCartesianRowsNumeric(xNums, series);
    }
    return buildCartesianRows(categories, series);
  }, [xMode, xValuesNum, categories, series]);
  const yDomain = useMemo(() => yDomainForLineArea(rows, keys, includeZeroOnY), [rows, keys, includeZeroOnY]);
  const xNumericDomain = useMemo(() => {
    if (xMode !== "number") return undefined;
    const xs = rows
      .map((r) => (typeof r.xNum === "number" ? r.xNum : Number(r.xNum)))
      .filter((n) => Number.isFinite(n));
    return numericAxisDomainFromValues(xs);
  }, [xMode, rows]);
  const xCategoryExtra = useMemo(
    () => (xMode === "category" ? denseCategoryAxisProps(rows) : {}),
    [xMode, rows],
  );
  const lineMargins = useMemo(
    () => ({
      top: 8,
      right: 12,
      left: CARTESIAN_MARGIN_LEFT,
      bottom: xMode === "category" && xCategoryExtra.height ? 32 : 8,
    }),
    [xMode, xCategoryExtra.height]
  );
  const legendPos = (props.legendPosition ?? "bottom") as string;
  const h = Math.min(props.heightPx ?? 280, 900);
  const aria = series.length ? `Line chart, ${series.length} series` : "Empty line chart";

  if (series.length === 0 || rows.length === 0) {
    return (
      <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
        <div className="a2ui-host-chart__empty">No series data</div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
      <ResponsiveContainer width="100%" height="100%">
        <ReLineChart style={chartSvgRootStyle} data={rows} margin={lineMargins}>
          {props.showGrid !== false ? (
            <CartesianGrid stroke="var(--a2ui-host-chart-grid-stroke)" strokeDasharray="3 3" />
          ) : null}
          {xMode === "number" ? (
            <XAxis
              type="number"
              dataKey="xNum"
              domain={xNumericDomain ? ([xNumericDomain[0], xNumericDomain[1]] as [number, number]) : ["auto", "auto"]}
              tick={chartTickSmall}
              tickFormatter={(v) => formatCartesianTick(typeof v === "number" ? v : Number(v))}
            />
          ) : (
            <XAxis dataKey="name" tick={chartTickSmall} {...xCategoryExtra} />
          )}
          <YAxis
            tick={chartTickSmall}
            width={52}
            domain={yDomain ?? undefined}
            tickFormatter={(v) => formatCartesianTick(typeof v === "number" ? v : Number(v))}
          />
          <Tooltip contentStyle={chartTooltipContentStyle} wrapperClassName="a2ui-host-chart__tooltip" />
          {props.showLegend !== false ? (
            <Legend
              {...legendProps(legendPos)}
              wrapperStyle={{ fontSize: 12, color: "var(--text2)" }}
              className="a2ui-host-chart__legend"
            />
          ) : null}
          {keys.map((k, i) => (
            <Line
              key={k}
              type={props.stepped ? "stepAfter" : "monotone"}
              dataKey={k}
              name={series[i]?.name ?? k}
              stroke={seriesCssVar(i)}
              strokeWidth={2.5}
              dot={rows.length > 72 ? false : { r: 2 }}
              activeDot={rows.length > 72 ? false : { r: 4 }}
              isAnimationActive={rows.length <= 400}
            />
          ))}
        </ReLineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
});

export const a2uiV09HostBarChart = createReactComponent(BarChartApi as any, ({ props, context }) => {
  const { series, categories: categoriesResolved } = useCartesianChartResolvedData(
    props.series,
    props.categories,
    undefined,
    context as { dataContext: ChartDataContextLike } | undefined,
  );
  const categories = categoriesResolved;
  const { rows, keys } = useMemo(() => buildCartesianRows(categories, series), [categories, series]);
  const vertical = props.orientation !== "horizontal";
  const layout = vertical ? "horizontal" : "vertical";
  const yDomain = useMemo(() => yDomainNonNegativeIfAllPositive(rows, keys), [rows, keys]);
  const xCategoryExtra = useMemo(() => denseCategoryAxisProps(rows), [rows]);
  const barMargins = useMemo(() => {
    const bottom = vertical ? (xCategoryExtra.height ? 32 : 8) : 8;
    return {
      top: 8,
      right: 12,
      left: vertical ? CARTESIAN_MARGIN_LEFT : 8,
      bottom,
    };
  }, [vertical, xCategoryExtra.height]);
  const legendPos = (props.legendPosition ?? "bottom") as string;
  const h = Math.min(props.heightPx ?? 280, 900);
  const stacked = props.layout === "stacked";
  const aria = series.length ? `Bar chart, ${series.length} series` : "Empty bar chart";

  if (series.length === 0 || rows.length === 0) {
    return (
      <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
        <div className="a2ui-host-chart__empty">No series data</div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart style={chartSvgRootStyle} data={rows} layout={layout} margin={barMargins}>
          {props.showGrid !== false ? (
            <CartesianGrid stroke="var(--a2ui-host-chart-grid-stroke)" strokeDasharray="3 3" />
          ) : null}
          {vertical ? (
            <>
              <XAxis dataKey="name" tick={chartTickSmall} {...xCategoryExtra} />
              <YAxis
                tick={chartTickSmall}
                width={52}
                domain={yDomain ?? undefined}
                tickFormatter={(v) => formatCartesianTick(typeof v === "number" ? v : Number(v))}
              />
            </>
          ) : (
            <>
              <XAxis
                type="number"
                tick={chartTickSmall}
                domain={yDomain ?? undefined}
                tickFormatter={(v) => formatCartesianTick(typeof v === "number" ? v : Number(v))}
              />
              <YAxis type="category" dataKey="name" width={88} tick={chartTickSmall} />
            </>
          )}
          <Tooltip contentStyle={chartTooltipContentStyle} wrapperClassName="a2ui-host-chart__tooltip" />
          {props.showLegend !== false ? (
            <Legend
              {...legendProps(legendPos)}
              wrapperStyle={{ fontSize: 12, color: "var(--text2)" }}
              className="a2ui-host-chart__legend"
            />
          ) : null}
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={series[i]?.name ?? k}
              fill={seriesCssVar(i)}
              stackId={stacked ? "stack" : undefined}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
});

export const a2uiV09HostAreaChart = createReactComponent(AreaChartApi as any, ({ props, context }) => {
  const xMode = props.xMode ?? "category";
  const includeZeroOnY = props.includeZeroOnY !== false;
  const { series, categories: categoriesResolved, xValuesNum } = useCartesianChartResolvedData(
    props.series,
    props.categories,
    props.xValues,
    context as { dataContext: ChartDataContextLike } | undefined,
  );
  const categories = categoriesResolved;
  const { rows, keys } = useMemo(() => {
    if (xMode === "number") {
      const maxLen = Math.max(0, ...series.map((s) => s.values.length));
      const xNums =
        xValuesNum && xValuesNum.length > 0
          ? xValuesNum
          : parseCategoriesAsNumericX(categories, maxLen);
      return buildCartesianRowsNumeric(xNums, series);
    }
    return buildCartesianRows(categories, series);
  }, [xMode, xValuesNum, categories, series]);
  const yDomain = useMemo(() => yDomainForLineArea(rows, keys, includeZeroOnY), [rows, keys, includeZeroOnY]);
  const xNumericDomain = useMemo(() => {
    if (xMode !== "number") return undefined;
    const xs = rows
      .map((r) => (typeof r.xNum === "number" ? r.xNum : Number(r.xNum)))
      .filter((n) => Number.isFinite(n));
    return numericAxisDomainFromValues(xs);
  }, [xMode, rows]);
  const xCategoryExtra = useMemo(
    () => (xMode === "category" ? denseCategoryAxisProps(rows) : {}),
    [xMode, rows],
  );
  const areaMargins = useMemo(
    () => ({
      top: 8,
      right: 12,
      left: CARTESIAN_MARGIN_LEFT,
      bottom: xMode === "category" && xCategoryExtra.height ? 32 : 8,
    }),
    [xMode, xCategoryExtra.height]
  );
  const legendPos = (props.legendPosition ?? "bottom") as string;
  const h = Math.min(props.heightPx ?? 280, 900);
  const stacked = props.stackMode === "stacked";
  const aria = series.length ? `Area chart, ${series.length} series` : "Empty area chart";

  if (series.length === 0 || rows.length === 0) {
    return (
      <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
        <div className="a2ui-host-chart__empty">No series data</div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart style={chartSvgRootStyle} data={rows} margin={areaMargins}>
          {props.showGrid !== false ? (
            <CartesianGrid stroke="var(--a2ui-host-chart-grid-stroke)" strokeDasharray="3 3" />
          ) : null}
          {xMode === "number" ? (
            <XAxis
              type="number"
              dataKey="xNum"
              domain={xNumericDomain ? ([xNumericDomain[0], xNumericDomain[1]] as [number, number]) : ["auto", "auto"]}
              tick={chartTickSmall}
              tickFormatter={(v) => formatCartesianTick(typeof v === "number" ? v : Number(v))}
            />
          ) : (
            <XAxis dataKey="name" tick={chartTickSmall} {...xCategoryExtra} />
          )}
          <YAxis
            tick={chartTickSmall}
            width={52}
            domain={yDomain ?? undefined}
            tickFormatter={(v) => formatCartesianTick(typeof v === "number" ? v : Number(v))}
          />
          <Tooltip contentStyle={chartTooltipContentStyle} wrapperClassName="a2ui-host-chart__tooltip" />
          {props.showLegend !== false ? (
            <Legend
              {...legendProps(legendPos)}
              wrapperStyle={{ fontSize: 12, color: "var(--text2)" }}
              className="a2ui-host-chart__legend"
            />
          ) : null}
          {keys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              name={series[i]?.name ?? k}
              stroke={seriesCssVar(i)}
              fill={seriesCssVar(i)}
              strokeWidth={2}
              fillOpacity={stacked ? 0.85 : 0.35}
              stackId={stacked ? "a" : undefined}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
});

export const a2uiV09HostPieChart = createReactComponent(PieChartApi as any, ({ props }) => {
  const segments = resolvePieSegments(props.segments);
  const legendPos = (props.legendPosition ?? "bottom") as string;
  const h = Math.min(props.heightPx ?? 320, 900);
  const inner = props.variant === "donut" ? "58%" : 0;
  const data = segments.map((s) => ({ name: s.label, value: s.value }));
  const aria = segments.length ? `Pie chart, ${segments.length} segments` : "Empty pie chart";

  if (segments.length === 0) {
    return (
      <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
        <div className="a2ui-host-chart__empty">No segments</div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
      <ResponsiveContainer width="100%" height="100%">
        <RePieChart style={chartSvgRootStyle}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={inner}
            outerRadius="78%"
            paddingAngle={2}
            labelLine={{ stroke: "var(--a2ui-host-chart-grid-stroke, rgba(255, 255, 255, 0.2))" }}
            label={pieSectorLabel}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={seriesCssVar(i)}
                stroke="var(--a2ui-host-chart-pie-cell-stroke, rgba(255, 255, 255, 0.18))"
                strokeWidth={1.5}
              />
            ))}
          </Pie>
          <Tooltip contentStyle={chartTooltipContentStyle} wrapperClassName="a2ui-host-chart__tooltip" />
          {props.showLegend !== false ? (
            <Legend
              {...legendProps(legendPos)}
              wrapperStyle={{ fontSize: 12, color: "var(--text2)" }}
              className="a2ui-host-chart__legend"
            />
          ) : null}
        </RePieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
});

export const a2uiV09HostHistogram = createReactComponent(HistogramApi as any, ({ props }) => {
  const samples = resolveNumArray(props.samples);
  const bins = Math.min(80, Math.max(2, Math.floor(props.binCount ?? 12)));
  const norm = props.normalize ?? "count";
  const rows = useMemo(() => histogramBins(samples, bins, norm), [samples, bins, norm]);
  const h = Math.min(props.heightPx ?? 260, 900);
  const aria = `Histogram, ${bins} bins`;

  if (rows.length === 0) {
    return (
      <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
        <div className="a2ui-host-chart__empty">No samples</div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart style={chartSvgRootStyle} data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
          {props.showGrid !== false ? (
            <CartesianGrid stroke="var(--a2ui-host-chart-grid-stroke)" strokeDasharray="3 3" />
          ) : null}
          <XAxis
            dataKey="name"
            tick={chartTickHist}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={60}
          />
          <YAxis tick={chartTickSmall} width={44} />
          <Tooltip contentStyle={chartTooltipContentStyle} wrapperClassName="a2ui-host-chart__tooltip" />
          <Bar dataKey="v" fill={seriesCssVar(0)} radius={[3, 3, 0, 0]} name={norm === "density" ? "Density" : "Count"} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
});

export const a2uiV09HostDensityPlot = createReactComponent(DensityPlotApi as any, ({ props }) => {
  const samples = resolveNumArray(props.samples);
  const pts = useMemo(() => kdePoints(samples), [samples]);
  const rows = useMemo(() => pts.map((p) => ({ name: p.x.toPrecision(4), x: p.x, y: p.y })), [pts]);
  const h = Math.min(props.heightPx ?? 260, 900);
  const aria = "Density plot";

  if (rows.length === 0) {
    return (
      <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
        <div className="a2ui-host-chart__empty">No samples</div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={props.title} heightPx={h} ariaLabel={aria}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart style={chartSvgRootStyle} data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          {props.showGrid !== false ? (
            <CartesianGrid stroke="var(--a2ui-host-chart-grid-stroke)" strokeDasharray="3 3" />
          ) : null}
          <XAxis dataKey="x" type="number" tick={chartTickSmall} />
          <YAxis tick={chartTickSmall} width={44} />
          <Tooltip contentStyle={chartTooltipContentStyle} wrapperClassName="a2ui-host-chart__tooltip" />
          <Area
            type="monotone"
            dataKey="y"
            name="Density"
            stroke={seriesCssVar(0)}
            fill={seriesCssVar(0)}
            fillOpacity={0.38}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
});

export const A2UI_V09_HOST_CHART_COMPONENT_NAMES = [
  "LineChart",
  "BarChart",
  "AreaChart",
  "PieChart",
  "Histogram",
  "DensityPlot",
  "Plot3D",
] as const;

const HOST_CHART_COMPONENTS = [
  a2uiV09HostLineChart,
  a2uiV09HostBarChart,
  a2uiV09HostAreaChart,
  a2uiV09HostPieChart,
  a2uiV09HostHistogram,
  a2uiV09HostDensityPlot,
  a2uiV09HostPlot3D,
] as const;

export function getA2uiV09HostChartComponents(): readonly any[] {
  return HOST_CHART_COMPONENTS;
}
