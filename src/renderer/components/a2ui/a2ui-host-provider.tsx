/**
 * Wraps {@link A2UIProvider} with a host-built theme that tracks shell CSS variables.
 * See `docs/a2ui-integration-roadmap.md` Phase 1.
 */

import { A2UIProvider } from "@a2ui/react/v0_8";
import type { A2UIProviderProps } from "@a2ui/react/v0_8";
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { buildA2uiHostTheme } from "../../theme/a2ui-host-theme";

const THEME_EVENT = "a2ui-host-theme-sync";

/** Optional: dispatch from devtools or after theme hot-swap to force theme rebuild. */
export function dispatchA2uiHostThemeSync(): void {
  try {
    window.dispatchEvent(new CustomEvent(THEME_EVENT));
  } catch {
    /* ignore */
  }
}

export function A2uiHostProvider(
  props: Pick<A2UIProviderProps, "onAction" | "children">,
): ReactElement {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const bump = (): void => {
      setRev((r) => r + 1);
    };
    const obs = new MutationObserver(bump);
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("storage", bump);
    window.addEventListener(THEME_EVENT, bump);
    return () => {
      obs.disconnect();
      window.removeEventListener("storage", bump);
      window.removeEventListener(THEME_EVENT, bump);
    };
  }, []);

  const theme = useMemo(() => buildA2uiHostTheme(), [rev]);

  return (
    <A2UIProvider theme={theme} onAction={props.onAction}>
      {props.children as ReactNode}
    </A2UIProvider>
  );
}
