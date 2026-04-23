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

const ArtifactRefSchema = z
  .object({
    artifactId: z.string().min(1),
    mime: z.string().optional(),
    name: z.string().optional(),
  })
  .strict();

export const ModelSourceSchema = z.union([z.string(), ArtifactRefSchema, DynamicLeafSchema]);

export const ModelFileSchema = z
  .object({
    label: z.string().optional(),
    source: ModelSourceSchema,
  })
  .strict();

const FilesBindingSchema = z.union([z.array(ModelFileSchema), DynamicLeafSchema]);

export const ModelViewer3DApi = {
  name: "ModelViewer3D",
  schema: z
    .object({
      ...ChartCommonProps,
      title: DynamicStringSchema.optional(),
      source: ModelSourceSchema.describe("GLB/GLTF URL, data URL, artifact ref, or binding."),
      files: FilesBindingSchema.optional().describe("Optional downloadable artifacts."),
      heightPx: z.number().min(240).max(900).default(520),
      autoRotate: z.boolean().default(true),
      cameraControls: z.boolean().default(true),
      exposure: z.number().min(0.2).max(2.5).default(1.0),
      environmentImage: z.string().optional().describe("HDRI env image URL (optional)."),
    })
    .strict()
    .describe("Interactive 3D model viewer (GLB/GLTF) with optional download links."),
} as const;

