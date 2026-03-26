import { useEffect, useRef, useState, type ReactElement } from "react";
import { BrowserImportOverlay } from "./BrowserImportOverlay";
import { FirstRunModal } from "./FirstRunModal";
import { ImportWizardModal } from "./ImportWizardModal";
import { ProfileModal } from "./ProfileModal";
import { SettingsPanel } from "./SettingsPanel";

const POLL_MS = 400;

export function ModalsBridge(): ReactElement | null {
  const [useReactModalsUi, setUseReactModalsUi] = useState(true);
  const [profileOpen, setProfileOpen] = useState(true);
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsHrefBackupRef = useRef<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const v = window.legacyBrowser?.getState?.()?.useReactModalsUi;
      setUseReactModalsUi(v !== false);
    };
    sync();
    const id = window.setInterval(sync, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!useReactModalsUi) return;
    const onSettings = () => setSettingsOpen(true);
    window.addEventListener("react-open-settings", onSettings);
    return () => window.removeEventListener("react-open-settings", onSettings);
  }, [useReactModalsUi]);

  useEffect(() => {
    if (!useReactModalsUi) return;
    const onCloseSettings = () => {
      setSettingsOpen(false);
      if (settingsHrefBackupRef.current) {
        window.history.replaceState(null, "", settingsHrefBackupRef.current);
        settingsHrefBackupRef.current = null;
      }
    };
    window.addEventListener("react-close-settings", onCloseSettings);
    return () => window.removeEventListener("react-close-settings", onCloseSettings);
  }, [useReactModalsUi]);

  useEffect(() => {
    if (!useReactModalsUi || !settingsOpen) return;
    if (!settingsHrefBackupRef.current) {
      settingsHrefBackupRef.current = window.location.href.replace(/#.*$/, "");
    }
    const base = window.location.href.replace(/#.*$/, "");
    window.history.replaceState(null, "", `${base}#/panel/settings`);
  }, [useReactModalsUi, settingsOpen]);

  if (!useReactModalsUi) return null;

  const closeSettings = () => {
    setSettingsOpen(false);
    if (settingsHrefBackupRef.current) {
      window.history.replaceState(null, "", settingsHrefBackupRef.current);
      settingsHrefBackupRef.current = null;
    }
  };

  const onProfileComplete = () => {
    window.dispatchEvent(new CustomEvent("profile-gate-complete"));
    setProfileOpen(false);
    if (!localStorage.getItem("hasRunBefore")) setFirstRunOpen(true);
    else if (!localStorage.getItem("hasImported")) setImportWizardOpen(true);
  };

  const closeFirstRun = () => {
    setFirstRunOpen(false);
    localStorage.setItem("hasRunBefore", "true");
    if (!localStorage.getItem("hasImported")) setImportWizardOpen(true);
  };

  const skipImportWizard = () => {
    setImportWizardOpen(false);
    localStorage.setItem("hasImported", "true");
  };

  return (
    <>
      <BrowserImportOverlay />
      <ProfileModal open={profileOpen} onComplete={onProfileComplete} />
      <FirstRunModal open={firstRunOpen} onDismiss={closeFirstRun} />
      <ImportWizardModal open={importWizardOpen} onSkip={skipImportWizard} />
      <SettingsPanel open={settingsOpen} onClose={closeSettings} />
    </>
  );
}
