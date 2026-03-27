import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import shellBody from "./browser/shell-body.html?raw";
import { initBrowserKernel } from "./browser/kernel";

let reactAppRoot: Root | null = null;

function traceShell(message: string, data?: unknown): void {
  try {
    void window.electronAPI?.debugLog?.({
      source: "shell-injector",
      message,
      data,
    });
  } catch {
    // no-op
  }
}

/**
 * Injects the static browser shell (including webview) then boots the TS kernel and mounts React bridges into #react-root
 * only after `window.legacyBrowser` exists (avoids bridges rendering before the kernel assigns the bridge).
 */
export function ShellInjector(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const shellInjected = useRef(false);
  const [kernelReady, setKernelReady] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    traceShell("layout effect start");

    if (!shellInjected.current) {
      host.innerHTML = shellBody;
      shellInjected.current = true;
      traceShell("shell body injected");
    }
    try {
      initBrowserKernel();
      traceShell("initBrowserKernel success");
    } catch (err) {
      console.error("[ShellInjector] initBrowserKernel failed:", err);
      traceShell("initBrowserKernel failed", {
        error: err instanceof Error ? err.stack || err.message : String(err),
      });
    } finally {
      traceShell("legacyBrowser present", { present: !!window.legacyBrowser });
      setKernelReady(!!window.legacyBrowser);
    }
  }, []);

  useLayoutEffect(() => {
    if (!kernelReady) return;
    const mount = document.getElementById("react-root");
    if (!mount) {
      traceShell("react-root missing");
      return;
    }

    if (!reactAppRoot) {
      reactAppRoot = createRoot(mount);
      traceShell("react app root created");
    }
    reactAppRoot.render(<App />);
    traceShell("react app rendered");
  }, [kernelReady]);

  return (
    <div
      ref={hostRef}
      id="shell-injector-host"
      className="flex min-h-0 min-w-0 w-full flex-1 flex-col"
    />
  );
}
