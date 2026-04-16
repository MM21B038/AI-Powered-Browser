declare module "@a2ui/web_core/v0_9" {
  export const Schemas: any;
  export const A2uiMessageSchema: any;
  export const MessageProcessor: any;
  export const SurfaceModel: any;
  export const SurfaceGroupModel: any;
  export const Catalog: any;
  /** @see `@a2ui/web_core` — used by host-only catalog components; keep in sync with runtime package. */
  export const AccessibilityAttributesSchema: import("zod").ZodTypeAny;
  export const CheckableSchema: import("zod").ZodObject<Record<string, import("zod").ZodTypeAny>>;
  export const DynamicStringSchema: import("zod").ZodTypeAny;
}

declare module "@a2ui/web_core/v0_9/basic_catalog" {
  export const TextApi: any;
  export const ImageApi: any;
  export const IconApi: any;
  export const VideoApi: any;
  export const AudioPlayerApi: any;
  export const RowApi: any;
  export const ColumnApi: any;
  export const ListApi: any;
  export const CardApi: any;
  export const TabsApi: any;
  export const ModalApi: any;
  export const DividerApi: any;
  export const ButtonApi: any;
  export const TextFieldApi: any;
  export const CheckBoxApi: any;
  export const ChoicePickerApi: any;
  export const SliderApi: any;
  export const DateTimeInputApi: any;
}

declare module "@a2ui/web_core/v0_9/schema/client-to-server.js" {
  export type A2uiClientAction = any;
}

// (Avoid deep-importing `@a2ui/web_core/v0_9/catalog/types.js` in app code:
// it is not exported under `package.json#exports` in some builds.)

