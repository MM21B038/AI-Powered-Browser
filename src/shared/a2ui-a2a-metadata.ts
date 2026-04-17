/**
 * A2A `Message.metadata` for the A2UI extension — declares client catalog support to the agent.
 * @see https://a2ui.org/specification/v0.8-a2a-extension/
 */

import { getHostSupportedCatalogIds } from "./a2ui-host-catalog";

/** Payload nested under `Message.metadata.a2uiClientCapabilities`. */
export type A2uiClientCapabilities = {
  /** URIs of catalogs this client can render, in preference order. */
  supportedCatalogIds: string[];
  /**
   * Whether the client may accept `inlineCatalogs` from the agent. Default false for safety.
   */
  acceptsInlineCatalogs?: boolean;
};

/**
 * Full metadata object to set on each outbound A2A {@link Message} when using A2UI.
 */
export function buildA2uiClientMessageMetadata(
  options?: Partial<Pick<A2uiClientCapabilities, "acceptsInlineCatalogs">> & {
    /** Override catalog list (defaults to {@link getHostSupportedCatalogIds}). */
    supportedCatalogIds?: readonly string[];
  },
): Record<string, unknown> {
  const supportedCatalogIds = options?.supportedCatalogIds?.length
    ? [...options.supportedCatalogIds]
    : [...getHostSupportedCatalogIds()];
  const caps: A2uiClientCapabilities = {
    supportedCatalogIds,
    acceptsInlineCatalogs: options?.acceptsInlineCatalogs ?? false,
  };
  return { a2uiClientCapabilities: caps };
}
