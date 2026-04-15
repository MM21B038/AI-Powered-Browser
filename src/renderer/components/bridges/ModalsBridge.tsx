import { useEffect, useRef, useState, type ReactElement } from "react";
import { BrowserImportOverlay } from "../modals/BrowserImportOverlay";
import { FirstRunModal } from "../modals/FirstRunModal";
import { ImportWizardModal } from "../modals/ImportWizardModal";
import { ProfileModal } from "../modals/ProfileModal";
import { SettingsPanel } from "../modals/SettingsPanel";
import { A2uiModalSurface } from "../a2ui/v0_9/A2uiModalSurface";

const POLL_MS = 400;

/** Clicks that open intelligent settings — must not run the outside-click closer (open+instant-close glitch). */
function isIntelligentSettingsOpenTrigger(target: Element): boolean {
  if (target.closest("#intelligentWorkspaceSettingsBtn")) return true;
  if (target.closest("#intelligentWorkspaceSettingsFooter")) return true;
  if (target.closest("#chatHistoryRailSettingsBtn")) return true;
  if (target.closest("#settingsBtnChat")) return true;
  if (target.closest(".model-quick-pick__empty")) return true;
  const ws =
    document.getElementById("appContainer")?.getAttribute("data-shell-workspace") ?? "";
  if ((ws === "intelligent" || ws === "browser") && target.closest("#settingsBtn")) {
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
  const [a2uiModal, setA2uiModal] = useState<{ open: boolean; surfaceId: string } | null>(null);
  /** Increment on each intelligent-assistant-settings-open so SettingsPanel re-runs layout if React `open` was already true (kernel cleared DOM). */
  const [intelligentSettingsDomEpoch, setIntelligentSettingsDomEpoch] = useState(0);
  /** Ignore outside mousedown briefly after open so the same gesture cannot close the modal (capture runs after React commits). */
  const ignoreOutsideMouseDownUntilRef = useRef(0);

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
    const open = (ev: Event) => {
      const d = (ev as CustomEvent<{ surfaceId?: string }>).detail;
      const surfaceId = (d?.surfaceId || "").trim() || "main";
      setA2uiModal({ open: true, surfaceId });
    };
    const close = () => setA2uiModal(null);
    window.addEventListener("a2ui-modal-open", open);
    window.addEventListener("a2ui-modal-close", close);
    return () => {
      window.removeEventListener("a2ui-modal-open", open);
      window.removeEventListener("a2ui-modal-close", close);
    };
  }, []);

  useEffect(() => {
    const open = () => {
      ignoreOutsideMouseDownUntilRef.current = Date.now() + 1200;
      setIntelligentSettingsModalOpen(true);
      setIntelligentSettingsDomEpoch((n) => n + 1);
    };
    window.addEventListener("intelligent-assistant-settings-open", open);
    return () => window.removeEventListener("intelligent-assistant-settings-open", open);
  }, []);

  /** Kernel cleared overlay DOM (tool hub, workspace switch, etc.) — drop React open state. */
  useEffect(() => {
    const onDomCleared = () => {
      setIntelligentSettingsModalOpen(false);
    };
    window.addEventListener("legacy-intelligent-settings-overlay-cleared", onDomCleared);
    return () =>
      window.removeEventListener("legacy-intelligent-settings-overlay-cleared", onDomCleared);
  }, []);

  /** Only close when switching to browser workspace — not on `ws !== "intelligent"` (empty/stale reads could close while opening). */
  useEffect(() => {
    const onWs = (ev: Event) => {
      const d = (ev as CustomEvent<{ workspace?: string }>).detail;
      const ws =
        d?.workspace ??
        document.getElementById("appContainer")?.getAttribute("data-shell-workspace") ??
        "";
      if (ws === "browser") {
        setIntelligentSettingsModalOpen(false);
      }
    };
    window.addEventListener("shell-workspace-changed", onWs);
    return () => window.removeEventListener("shell-workspace-changed", onWs);
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
      if (Date.now() < ignoreOutsideMouseDownUntilRef.current) return;
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
      <A2uiModalSurface
        open={!!a2uiModal?.open}
        surfaceId={a2uiModal?.surfaceId ?? "main"}
        onClose={() => setA2uiModal(null)}
      />
      {/* Keep mounted so closing runs layout effect that clears data-settings-open / webview overlay hit-target */}
      <SettingsPanel
        open={intelligentSettingsModalOpen}
        layout="modal"
        modalSize="xl"
        panel="intelligent"
        domSyncEpoch={intelligentSettingsDomEpoch}
        onClose={() => setIntelligentSettingsModalOpen(false)}
      />
    </>
  );
}
