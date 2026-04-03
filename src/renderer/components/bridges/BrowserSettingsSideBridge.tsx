import { useEffect, useState, type ReactElement } from "react";
import { SettingsPanel } from "../modals/SettingsPanel";

/** Browser workspace: rail Settings opens #browserSettingsPanel; React body portals here. */
export function BrowserSettingsSideBridge(): ReactElement | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const v = (e as CustomEvent<{ open?: boolean }>).detail?.open;
      setOpen(v === true);
    };
    window.addEventListener("browser-chrome-settings-side", onEvt);
    return () => window.removeEventListener("browser-chrome-settings-side", onEvt);
  }, []);

  return (
    <SettingsPanel
      open={open}
      layout="sidePanel"
      panel="browser"
      onClose={() => window.legacyBrowser?.closeBrowserSettingsSidePanel?.()}
    />
  );
}
