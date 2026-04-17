import { z } from "zod";

const DataBindingSchema = z.object({
  path: z.string(),
});

const FunctionCallSchema = z.object({
  call: z.string(),
  args: z.record(z.string(), z.any()),
  returnType: z.enum(["string", "number", "boolean", "array", "object", "any", "void"]).default("boolean"),
});

/** Wire-compatible with `@a2ui/web_core` `DynamicNumberSchema` (deep import not exported for Vite). */
export const a2uiV09DynamicNumberSchema = z.union([z.number(), DataBindingSchema, FunctionCallSchema]);
