import { z } from "zod";
import { DynamicStringSchema } from "@a2ui/web_core/v0_9";
import { ChartCommonProps } from "./a2ui-v0_9-chart-types";

const FunctionCallShape = z.object({
  call: z.string(),
  args: z.record(z.string(), z.any()),
  returnType: z
    .enum(["string", "number", "boolean", "array", "object", "any", "void"])
    .optional(),
});

export const DynamicLeafSchema = z.union([z.object({ path: z.string() }), FunctionCallShape]);

const NumArraySchema = z.union([z.array(z.number()), DynamicLeafSchema]);
const NumGridSchema = z.union([z.array(z.array(z.number())), DynamicLeafSchema]);

const SurfaceDataSchema = z
  .object({
    x: NumArraySchema.describe("X coordinates (length = z[0].length)."),
    y: NumArraySchema.describe("Y coordinates (length = z.length)."),
    z: NumGridSchema.describe("Z grid: rows over y, columns over x."),
  })
  .strict();

const Point3dSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    label: z.string().optional(),
  })
  .strict();

const PointsBindingSchema = z.union([z.array(Point3dSchema), DynamicLeafSchema]);

/** Inline `{ x,y,z,i,j,k }` from `mesh_*` catalog (single field on a mesh trace). */
const Mesh3dWireObjectSchema = z
  .object({
    x: z.array(z.number()),
    y: z.array(z.number()),
    z: z.array(z.number()),
    i: z.array(z.number()),
    j: z.array(z.number()),
    k: z.array(z.number()),
  })
  .passthrough();

/** One layer in a multi-trace Plot3D (surface, scatter, or mesh3d). */
const Plot3DTraceSurfaceSchema = z
  .object({
    traceType: z.literal("surface"),
    x: NumArraySchema,
    y: NumArraySchema,
    z: NumGridSchema,
    name: DynamicStringSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();

const Plot3DTraceScatterSchema = z
  .object({
    traceType: z.literal("scatter"),
    points: PointsBindingSchema,
    name: DynamicStringSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
    markerSize: z.number().min(0.5).max(16).optional(),
  })
  .strict();

/** Either per-field x,y,z,i,j,k **or** a single binding / inline object on `x` or `mesh` (full `{x,y,z,i,j,k}` from `mesh_*`). */
const Plot3DTraceMeshSchema = z
  .object({
    traceType: z.literal("mesh"),
    x: z.union([NumArraySchema, DynamicLeafSchema, Mesh3dWireObjectSchema]).optional(),
    y: NumArraySchema.optional(),
    z: NumArraySchema.optional(),
    i: NumArraySchema.optional(),
    j: NumArraySchema.optional(),
    k: NumArraySchema.optional(),
    mesh: z.union([DynamicLeafSchema, Mesh3dWireObjectSchema]).optional(),
    name: DynamicStringSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();

const Plot3DTraceSchema = z.discriminatedUnion("traceType", [
  Plot3DTraceSurfaceSchema,
  Plot3DTraceScatterSchema,
  Plot3DTraceMeshSchema,
]);

const TracesBindingSchema = z.union([z.array(Plot3DTraceSchema), DynamicLeafSchema]);

export const Plot3DApi = {
  name: "Plot3D",
  schema: z
    .object({
      ...ChartCommonProps,
      title: DynamicStringSchema.optional(),
      kind: z.enum(["surface", "scatter"]).default("surface"),
      surface: SurfaceDataSchema.optional(),
      points: PointsBindingSchema.optional(),
      /**
       * When non-empty after resolve, replaces legacy `kind`/`surface`/`points` for this plot.
       * Order is draw order; combine `series_surface`, `mesh_*`, and scatter traces.
       */
      traces: TracesBindingSchema.optional(),
      heightPx: z.number().min(180).max(900).default(420),
      /** `symmetric`: each axis spans [-R,R] with R from data so all octants are visible when values are one-sided. */
      axisRangeMode: z.enum(["auto", "symmetric"]).default("auto"),
    })
    .strict()
    .describe("Interactive 3D plot (surface, scatter, mesh3d; optional multi-trace via `traces`)."),
} as const;
