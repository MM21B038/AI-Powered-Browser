import { z } from "zod";
import { AccessibilityAttributesSchema } from "@a2ui/web_core/v0_9";

const CommonProps = {
  accessibility: AccessibilityAttributesSchema.optional(),
  weight: z
    .number()
    .describe(
      "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column."
    )
    .optional(),
};

/** Allowed CSS lengths only (no arbitrary calc/expressions in NDJSON). */
const cssLengthSchema = z
  .string()
  .regex(/^(0|([0-9]+(\.[0-9]+)?(rem|px|%)))$/)
  .describe("CSS length: 0, or number + rem, px, or % (e.g. 8px, 1rem).");

/**
 * Host-only layout helper: empty flex child (same common props as other leaves, plus optional mins).
 * Registered in {@link buildA2uiV09HostCatalog}.
 */
export const SpacerApi = {
  name: "Spacer",
  schema: z
    .object({
      ...CommonProps,
      minWidth: cssLengthSchema.optional(),
      minHeight: cssLengthSchema.optional(),
    })
    .strict(),
} as const;
