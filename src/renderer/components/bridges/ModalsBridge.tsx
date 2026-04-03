import { useEffect, useState, type ReactElement } from "react";
import { BrowserImportOverlay } from "../modals/BrowserImportOverlay";
import { FirstRunModal } from "../modals/FirstRunModal";
import { ImportWizardModal } from "../modals/ImportWizardModal";
import { ProfileModal } from "../modals/ProfileModal";
import { SettingsPanel } from "../modals/SettingsPanel";

const POLL_MS = 400;

/** Clicks that open intelligent settings — must not run the outside-click closer first (close+reopen flicker). */
function isIntelligentSettingsOpenTrigger(target: Element): boolean {
  if (target.closest("#intelligentWorkspaceSettingsBtn")) return true;
  if (target.closest("#chatHistoryRailSettingsBtn")) return true;
  if (target.closest("#settingsBtnChat")) return true;
  if (target.closest(".model-quick-pick__empty")) return true;
  if (
    document.getElementById("appContainer")?.getAttribute("data-shell-workspace") ===
      "intelligent" && target.closest("#settingsBtn")
  ) {
    return true;
  }
  return false;
}

export function ModalsBridge(): ReactElement | null {
  const [useReactModalsUi, setUseReactModalsUi] = useState(true);
  const [profileOpen, setProfileOpen] = useState(true);
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [intelligentSettingsModalOpen, setIntelligentSettingsModalOpen] = useState(false);

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
    const open = () => setIntelligentSettingsModalOpen(true);
    window.addEventListener("intelligent-assistant-settings-open", open);
    return () => window.removeEventListener("intelligent-assistant-settings-open", open);
  }, []);

  useEffect(() => {
    if (!intelligentSettingsModalOpen) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIntelligentSettingsModalOpen(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [intelligentSettingsModalOpen]);

  /** IW modal: backdrop is inset and does not cover chat history, so clicks there never hit
   * .settings-overlay. Dismiss when pressing outside the panel (incl. history sidebar), but
   * keep splitter drags working. */
  useEffect(() => {
    if (!intelligentSettingsModalOpen) return;
    const onDownCapture = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("#chatHistoryResizeHandle")) return;
      if (isIntelligentSettingsOpenTrigger(t)) return;
      const panel = document.querySelector(
        "#webviewOverlayHost .settings-panel.settings-panel--modal-xl",
      );
      if (panel?.contains(t)) return;
      setIntelligentSettingsModalOpen(false);
    };
    document.addEventListener("mousedown", onDownCapture, true);
    return () => document.removeEventListener("mousedown", onDownCapture, true);
  }, [intelligentSettingsModalOpen]);

  if (!useReactModalsUi) return null;

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
      {/* Keep mounted so closing runs layout effect that clears data-settings-open / webview overlay hit-target */}
      <SettingsPanel
        open={intelligentSettingsModalOpen}
        layout="modal"
        modalSize="xl"
        panel="intelligent"
        onClose={() => setIntelligentSettingsModalOpen(false)}
      />
    </>
  );
}
