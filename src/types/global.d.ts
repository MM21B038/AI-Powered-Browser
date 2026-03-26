import type { AutomationCommand, AutomationResult } from "../shared/automation-types";
import type { ElectronApi } from "../shared/ipc-types";

declare global {
  /** Tab row snapshot for React tab strip (mirrors legacy tab objects). */
  interface LegacyTabSnapshot {
    id: number;
    title: string;
    url: string;
    loading: boolean;
    favicon: string | null;
  }

  interface LegacyBrowserState {
    activeTabId: number | null;
    tabCount: number;
    activeUrl: string;
    canGoBack: boolean;
    canGoForward: boolean;
    isLoading: boolean;
    useReactTabsUi?: boolean;
    useReactNavUi?: boolean;
    useReactSidePanelsUi?: boolean;
    useReactModalsUi?: boolean;
    useReactToastUi?: boolean;
    useReactChatResizeUi?: boolean;
  }

  interface LegacyNavState {
    address: string;
    canGoBack: boolean;
    canGoForward: boolean;
    isLoading: boolean;
    zoomPercent: number;
    zoomLevel: number;
    findActive: boolean;
    findQuery: string;
    findMatchText: string;
    securityIconClass: string;
    statusSecurityText: string;
    isBookmarked: boolean;
  }

  interface LegacyProfileSnapshot {
    name: string;
    bookmarks: unknown[];
    history: unknown[];
    passwords: unknown[];
  }

  interface LegacyBrowserBridge {
    newTab: () => void;
    /** Open a new tab; resolves URL like the address bar. */
    createTabWithUrl: (url?: string) => void;
    navigate: (url: string) => void;
    back: () => void;
    forward: () => void;
    reload: () => void;
    reloadOrStop?: () => void;
    goHome?: () => void;
    getWebviewElement?: () => HTMLElement | null;
    clickUi?: (id: string) => void;
    openDevTools?: () => void;
    openScreenshotMenu?: () => void;
    getNavState: () => LegacyNavState;
    findInPageQuery?: (q: string) => void;
    findNext?: () => void;
    findPrev?: () => void;
    toggleFind?: () => void;
    closeFind?: () => void;
    zoomIn?: () => void;
    zoomOut?: () => void;
    zoomReset?: () => void;
    getState: () => LegacyBrowserState;
    getTabs: () => LegacyTabSnapshot[];
    switchTabById: (id: number) => void;
    closeTabById: (id: number) => void;
    /** @param side drop edge relative to `targetId` */
    reorderTabs: (movedId: number, targetId: number, side: "left" | "right") => void;
    getProfileSnapshot?: () => LegacyProfileSnapshot;
    navigateToUrl?: (url: string) => void;
    closeSidePanels?: (opts?: { restorePreviousUrl?: boolean }) => void;
    /** Sync left rail active state + webview pointer-events after panel/hub/settings changes */
    syncRailAndWebview?: () => void;
    toggleSidePanel?: (panelId: string) => void;
    showToast?: (message: string, duration?: number) => void;
    removeBookmarkByUrl?: (url: string) => void;
    clearAllHistory?: () => void;
    deletePasswordEntry?: (url: string, username: string) => void;
    getHomePage?: () => string;
    setHomePage?: (url: string) => void;
    applyTheme?: (name: string) => void;
    initDataPanels?: () => void;
    loadProfileByName?: (name: string) => Promise<void>;
    createProfileFromName?: (name: string) => Promise<void>;
    runBrowserImportTarget?: (target: string) => Promise<void>;
    getChatOpen?: () => boolean;
    setChatPanelOpen?: (open: boolean) => void;
    /** Typed automation (same engine as chat commands). */
    runAutomationCommand?: (cmd: AutomationCommand) => Promise<AutomationResult>;
    dispatchAutomationLine?: (line: string) => Promise<AutomationResult>;
    openToolsHub?: (opts?: { toolId?: string | null }) => void;
    closeToolsHub?: () => void;
    toggleToolsHub?: () => void;
    runQuickCommand?: (cmd: string, opts?: { closeHub?: boolean }) => void;
  }

  interface Window {
    electronAPI: ElectronApi;
    legacyBrowser?: LegacyBrowserBridge;
    __FEATURE_FLAGS__?: {
      USE_REACT_MODALS: boolean;
      USE_REACT_TOAST: boolean;
      USE_REACT_CHAT_RESIZE: boolean;
    };
  }
}

export {};
