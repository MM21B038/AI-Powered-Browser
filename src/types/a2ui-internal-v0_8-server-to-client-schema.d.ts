/**
 * Types for `@a2ui/web_core` v0.8 Zod schemas; JS resolves via `paths` in tsconfig.base.json.
 */
declare module "@a2ui-internal/v0_8/server-to-client-schema" {
  export const A2uiMessageSchema: {
    parse: (data: unknown) => unknown;
  };
}
