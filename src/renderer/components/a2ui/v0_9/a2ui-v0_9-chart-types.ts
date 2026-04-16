import { z } from "zod";
import { AccessibilityAttributesSchema, DynamicStringSchema } from "@a2ui/web_core/v0_9";

/** Shared with host chart components (Row/Column `weight` + a11y). */
export const ChartCommonProps = {
  accessibility: AccessibilityAttributesSchema.optional(),
  weight: z
    .number()
    .describe(
      "Flex-grow when this chart is a direct child of Row or Column (same as other components)."
    )
    .optional(),
};

const FunctionCallShape = z.object({
  call: z.string(),
  args: z.record(z.string(), z.any()),
  returnType: z
    .enum(["string", "number", "boolean", "array", "object", "any", "void"])
    .optional(),
});

/** Literal array or data-model / expression binding. */
export const NumberArrayBindingSchema = z.union([
  z.array(z.number()),
  z.object({ path: z.string() }),
  FunctionCallShape,
]);

export const StringArrayBindingSchema = z.union([
  z.array(z.string()),
  z.object({ path: z.string() }),
  FunctionCallShape,
]);

export const LegendPositionSchema = z
  .enum(["top", "bottom", "left", "right"])
  .default("bottom")
  .describe("Legend placement.");

export const SeriesRowSchema = z
  .object({
    name: z.string().describe("Series name shown in legend."),
    values: NumberArrayBindingSchema.describe(
      "Y values; length must match categories when provided. May bind to a number array in the data model."
    ),
  })
  .strict();

export const SeriesBindingSchema = z.union([
  z.array(SeriesRowSchema),
  z.object({ path: z.string() }),
  FunctionCallShape,
]);

export const LineChartApi = {
  name: "LineChart",
  schema: z
    .object({
      ...ChartCommonProps,
      title: DynamicStringSchema.describe("Chart title.").optional(),
      categories: StringArrayBindingSchema.optional().describe(
        "X-axis category labels; if omitted, indices 0..n-1 are used."
      ),
      series: SeriesBindingSchema.describe("One or more numeric series aligned by category index."),
      showLegend: z.boolean().default(true),
      legendPosition: LegendPositionSchema,
      showGrid: z.boolean().default(true),
      stepped: z.boolean().default(false).describe("Use stepped lines instead of linear segments."),
      heightPx: z.number().min(120).max(900).default(280),
    })
    .strict()
    .describe("Multi-series line chart (cartesian)."),
} as const;

export const BarChartApi = {
  name: "BarChart",
  schema: z
    .object({
      ...ChartCommonProps,
      title: DynamicStringSchema.optional(),
      categories: StringArrayBindingSchema.optional(),
      series: SeriesBindingSchema,
      orientation: z
        .enum(["vertical", "horizontal"])
        .default("vertical")
        .describe("Bar direction."),
      layout: z
        .enum(["grouped", "stacked"])
        .default("grouped")
        .describe("Grouped side-by-side bars or stacked totals."),
      showLegend: z.boolean().default(true),
      legendPosition: LegendPositionSchema,
      showGrid: z.boolean().default(true),
      heightPx: z.number().min(120).max(900).default(280),
    })
    .strict(),
} as const;

export const AreaChartApi = {
  name: "AreaChart",
  schema: z
    .object({
      ...ChartCommonProps,
      title: DynamicStringSchema.optional(),
      categories: StringArrayBindingSchema.optional(),
      series: SeriesBindingSchema,
      stackMode: z
        .enum(["overlay", "stacked"])
        .default("overlay")
        .describe("Overlaid transparent areas or stacked areas."),
      showLegend: z.boolean().default(true),
      legendPosition: LegendPositionSchema,
      showGrid: z.boolean().default(true),
      heightPx: z.number().min(120).max(900).default(280),
    })
    .strict(),
} as const;

export const PieSegmentSchema = z
  .object({
    label: z.string(),
    value: z.number(),
  })
  .strict();

export const PieChartApi = {
  name: "PieChart",
  schema: z
    .object({
      ...ChartCommonProps,
      title: DynamicStringSchema.optional(),
      segments: z.union([z.array(PieSegmentSchema).min(1), z.object({ path: z.string() }), FunctionCallShape]),
      variant: z.enum(["pie", "donut"]).default("pie"),
      showLegend: z.boolean().default(true),
      legendPosition: LegendPositionSchema,
      heightPx: z.number().min(120).max(900).default(320),
    })
    .strict(),
} as const;

export const HistogramApi = {
  name: "Histogram",
  schema: z
    .object({
      ...ChartCommonProps,
      title: DynamicStringSchema.optional(),
      samples: NumberArrayBindingSchema.describe("Numeric samples to bin."),
      binCount: z.number().int().min(2).max(80).default(12),
      normalize: z
        .enum(["count", "density"])
        .default("count")
        .describe("Bin height is raw count or density (count / total / bin width)."),
      showGrid: z.boolean().default(true),
      heightPx: z.number().min(120).max(900).default(260),
    })
    .strict(),
} as const;

export const DensityPlotApi = {
  name: "DensityPlot",
  schema: z
    .object({
      ...ChartCommonProps,
      title: DynamicStringSchema.optional(),
      samples: NumberArrayBindingSchema.describe("Numeric samples for kernel density estimate."),
      showGrid: z.boolean().default(true),
      heightPx: z.number().min(120).max(900).default(260),
    })
    .strict(),
} as const;
