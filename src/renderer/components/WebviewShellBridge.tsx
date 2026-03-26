import { useEffect, type ReactElement } from "react";

/**
 * Ensures a single legacy `<webview id="browserFrame">` exists and is exposed via
 * `legacyBrowser.getWebviewElement()`. Webview listeners are registered once in the browser kernel.
 */
export function WebviewShellBridge(): ReactElement | null {
  useEffect(() => {
    const wv = window.legacyBrowser?.getWebviewElement?.() as HTMLElement | null | undefined;
    if (!wv || wv.id !== "browserFrame") {
      console.warn("[WebviewShellBridge] Expected #browserFrame webview from legacy bridge.");
    }
  }, []);
  return null;
}
