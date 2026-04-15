declare module "@a2ui/web_core/v0_9" {
  export const Schemas: any;
  export const A2uiMessageSchema: any;
  export const MessageProcessor: any;
  export const SurfaceModel: any;
  export const SurfaceGroupModel: any;
  export const Catalog: any;
}

declare module "@a2ui/web_core/v0_9/schema/client-to-server.js" {
  export type A2uiClientAction = any;
}

// (Avoid deep-importing `@a2ui/web_core/v0_9/catalog/types.js` in app code:
// it is not exported under `package.json#exports` in some builds.)

