/**
 * Runs under {@link A2UIProvider} so the host can call `processMessages` from `onAction`
 * (the parent cannot use `useA2UIActions` outside the provider).
 */

import { useLayoutEffect, type MutableRefObject, type ReactElement } from "react";
import type { ServerToClientMessage } from "@a2ui/react/v0_8";
import { useA2UIActions } from "@a2ui/react/v0_8";

export type A2uiHostProcessorApi = {
  processMessages: (messages: ServerToClientMessage[]) => void;
  /** Read-only access to the current surface state (data model + tree). */
  getSurface: (surfaceId: string) => unknown;
};

export function A2uiHostProcessorBridge(props: {
  apiRef: MutableRefObject<A2uiHostProcessorApi | null>;
}): ReactElement | null {
  const { processMessages, getSurface } = useA2UIActions();

  useLayoutEffect(() => {
    props.apiRef.current = { processMessages, getSurface };
    return () => {
      props.apiRef.current = null;
    };
  }, [processMessages, getSurface, props.apiRef]);

  return null;
}
