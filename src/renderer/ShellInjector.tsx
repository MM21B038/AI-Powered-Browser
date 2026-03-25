import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import shellBody from "./browser/shell-body.html?raw";
import { initBrowserKernel } from "./browser/kernel";

let reactAppRoot: Root | null = null;

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

    if (!shellInjected.current) {
      host.innerHTML = shellBody;
      shellInjected.current = true;
    }
    try {
      initBrowserKernel();
    } catch (err) {
      console.error("[ShellInjector] initBrowserKernel failed:", err);
    } finally {
      setKernelReady(!!window.legacyBrowser);
    }
  }, []);

  useLayoutEffect(() => {
    if (!kernelReady) return;
    const mount = document.getElementById("react-root");
    if (!mount) return;

    if (!reactAppRoot) {
      reactAppRoot = createRoot(mount);
    }
    reactAppRoot.render(<App />);
  }, [kernelReady]);

  return (
    <div
      ref={hostRef}
      id="shell-injector-host"
      className="flex min-h-0 min-w-0 w-full flex-1 flex-col"
    />
  );
}
