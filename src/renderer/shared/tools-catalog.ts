/**
 * Tools hub: categories and quick commands (same `command` values as .qc-btn data-command).
 */

/** Which commands open a full drill-down screen in the hub. */
export type ToolsHubToolDetail =
  | "scroll"
  | "fill"
  | "select"
  | "runJs"
  | "type"
  | "click"
  | "press"
  | "navigate"
  | "navControls"
  | "tabControls"
  | "wait"
  | "io"
  | "browserSearch"
  | "scientificCalc"
  | "pythonSandbox"
  | "userSkills"
  | "pickerDemo"
  | "session"
  | "simple";

export type ToolsHubItem = {
  id: string;
  label: string;
  description: string;
  /** Inline SVG, stroke currentColor */
  iconSvg: string;
  /** Matches kernel quick-command templates / tool toggles */
  command: string;
  /** If set, hub opens tool detail instead of quick-insert */
  detail?: ToolsHubToolDetail;
};

export type ToolsHubCategory = {
  id: string;
  title: string;
  subtitle?: string;
  iconSvg: string;
  items: ToolsHubItem[];
};

const iconNav = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/><circle cx="8" cy="18" r="1.5" fill="currentColor"/></svg>`;

const iconInteract = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5"/></svg>`;

const iconCapture = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5l1.5-2h5L16 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const iconInspect = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 11h6M11 8v6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/></svg>`;

const iGlobe = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.4"/><path d="M3 12h18M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18" stroke="currentColor" stroke-width="1.2" opacity="0.45"/></svg>`;

const iLink = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 14l-1 1a4 4 0 0 1-5.5-5.5l1-1M14 10l1-1a4 4 0 0 1 5.5 5.5l-1 1M8 16l8-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const iTitle = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6h14M8 6v12M16 6v12M5 18h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const iReload = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v6h6M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 21" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 21v-6h-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const iTabs = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.4"/></svg>`;

const iPointer = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4l7 18 2-7 7-2-7-2-2-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

const iForm = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const iKeyboard = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M7 11h.01M11 11h.01M15 11h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const iSelect = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9h12l-6 7-6-7Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><path d="M6 15h12" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" opacity="0.45"/></svg>`;

const iScroll = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const iClock = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.4"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const iSession = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const iKillSession = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.4"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const iShot = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.4"/></svg>`;

const iDoc = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 3h4v5l4 6a3 3 0 0 1-2.6 4.5H8.6A3 3 0 0 1 10 14l4-6V3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

const iList = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const iPickerHover = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const iPickerInteractive = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4H4v4M17 4h3v4M7 20H4v-4M17 20h3v-4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.4"/><path d="M12 9V5l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/></svg>`;

const iElemshot = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8h3M5 12h2M5 16h3M16 8h3M16 12h2M16 16h3M8 5v3M12 5v2M16 5v3M8 19v3M12 19v2M16 19v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="8" y="8" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>`;
const iRunJs = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 7l-4 5 4 5M16 7l4 5-4 5M14 4l-4 16" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const iSearch = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.35"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`;
const iCalc = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.35"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`;

const iPython = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4h2v3H9V4zm4 0h2v3h-2V4z" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M7 8h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8z" stroke="currentColor" stroke-width="1.35"/><path d="M10 12h4M12 10v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const iSkill = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="1.35"/><path d="M8 7h8M8 11h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/></svg>`;

export const TOOLS_HUB_CATEGORIES: ToolsHubCategory[] = [
  {
    id: "navigate",
    title: "Navigate & tabs",
    subtitle: "URLs, history, and tab management",
    iconSvg: iconNav,
    items: [
      {
        id: "navigate",
        label: "Go to URL",
        description: "Opens a URL in the active tab—preview shows the address bar and load.",
        iconSvg: iGlobe,
        command: "navigate",
        detail: "navigate",
      },
      { id: "url", label: "Get URL", description: "Shows the current page URL (example output below).", iconSvg: iLink, command: "url", detail: "io" },
      { id: "title", label: "Get title", description: "Shows the page title (example output below).", iconSvg: iTitle, command: "title", detail: "io" },
      {
        id: "navControls",
        label: "Nav controls",
        description: "Back, forward, or reload the active tab—preview shows a realistic nav gesture.",
        iconSvg: iReload,
        command: "nav",
        detail: "navControls",
      },
      { id: "tabs", label: "List tabs", description: "Lists tabs as a table with 5-digit TabIds (example below).", iconSvg: iTabs, command: "tabs", detail: "io" },
      {
        id: "tabControls",
        label: "Tab controls",
        description: "Shows how tabs change over time—preview cycles through new, switch, and close.",
        iconSvg: iTabs,
        command: "tab",
        detail: "tabControls",
      },
    ],
  },
  {
    id: "interact",
    title: "Interact",
    subtitle: "Click, type, and forms",
    iconSvg: iconInteract,
    items: [
      {
        id: "click",
        label: "Click element",
        description: "Finds the element by selector, scrolls it into view, then clicks—shown below as match, zoom, and pointer.",
        iconSvg: iPointer,
        command: "click",
        detail: "click",
      },
      {
        id: "fill",
        label: "Fill form",
        description: "Fill an input or textarea by CSS selector",
        iconSvg: iForm,
        command: "fill",
        detail: "fill",
      },
      {
        id: "type",
        label: "Type text",
        description: "Types into the currently focused field—shown below as focused row, zoom, and keystrokes.",
        iconSvg: iKeyboard,
        command: "type",
        detail: "type",
      },
      {
        id: "selectOption",
        label: "Select dropdown",
        description:
          "Targets a native select element by CSS selector, then picks an option by visible label, option value, or zero-based index—fires change like a real user.",
        iconSvg: iSelect,
        command: "select",
        detail: "select",
      },
      {
        id: "scroll",
        label: "Scroll",
        description: "Scroll the page up or down",
        iconSvg: iScroll,
        command: "scroll",
        detail: "scroll",
      },
      {
        id: "pressHold",
        label: "Press & hold",
        description: "Presses and holds an element for a fixed duration.",
        iconSvg: iClock,
        command: "press",
        detail: "press",
      },
      {
        id: "runJsInteract",
        label: "Run JavaScript",
        description:
          "Execute custom JavaScript in the current page to perform advanced actions or analysis; returns your script output when provided.",
        iconSvg: iRunJs,
        command: "runJs",
        detail: "runJs",
      },
      {
        id: "elementPicker",
        label: "Element picker",
        description:
          "Turns on hover mode: move over the page to highlight elements and copy a CSS selector—preview walks toggle, highlight, and ready states.",
        iconSvg: iPickerHover,
        command: "picker",
        detail: "pickerDemo",
      },
      {
        id: "pickerInteractive",
        label: "Interactive picker",
        description:
          "Snap-style picker: targets the nearest element, then pick and run an action—shown below as toggle, snap, pick, and done.",
        iconSvg: iPickerInteractive,
        command: "pickerInteractive",
        detail: "pickerDemo",
      },
      {
        id: "elemshot",
        label: "Element screenshot",
        description:
          "Capture just one element after you aim and confirm—preview shows aim, highlight, flash, and saved.",
        iconSvg: iElemshot,
        command: "elemshot",
        detail: "pickerDemo",
      },
      {
        id: "wait",
        label: "Wait",
        description: "Pause for milliseconds or seconds—preview shows a timer filling.",
        iconSvg: iClock,
        command: "wait",
        detail: "wait",
      },
      {
        id: "createSession",
        label: "Create session",
        description: "Creates a new browser session with headless true or false and returns session id.",
        iconSvg: iSession,
        command: "session",
        detail: "session",
      },
      {
        id: "killSession",
        label: "Kill session",
        description: "Fully closes a session and invalidates its session id.",
        iconSvg: iKillSession,
        command: "killSession",
        detail: "session",
      },
    ],
  },
  {
    id: "capture",
    title: "Capture & pickers",
    subtitle: "Screenshots and element tools",
    iconSvg: iconCapture,
    items: [
      { id: "screenshot", label: "Screenshot", description: "Captures the viewport or full page (example output below).", iconSvg: iShot, command: "screenshot", detail: "io" },
      { id: "viewportMd", label: "Viewport MD", description: "Extract markdown for the current viewport (example output below).", iconSvg: iDoc, command: "viewportMd", detail: "io" },
    ],
  },
  {
    id: "inspect",
    title: "Inspect",
    subtitle: "Page structure",
    iconSvg: iconInspect,
    items: [
      { id: "formSchema", label: "Form schema", description: "Describes detected form fields (example output below).", iconSvg: iForm, command: "formSchema", detail: "io" },
      { id: "interactables", label: "Interactables", description: "Lists clickable / input elements (example output below).", iconSvg: iList, command: "interactables", detail: "io" },
      {
        id: "browserSearch",
        label: "Browser Search",
        description: "Searches DuckDuckGo and returns a compact table of heading, URL, and snippet.",
        iconSvg: iSearch,
        command: "browserSearch",
        detail: "browserSearch",
      },
      {
        id: "runJsInspect",
        label: "Run JavaScript",
        description: "Run page-context JavaScript for custom extraction, checks, or analysis, and return the script result.",
        iconSvg: iRunJs,
        command: "runJs",
        detail: "runJs",
      },
      {
        id: "scientificCalc",
        label: "Calculator",
        description:
          "Expressions: + − × ÷, ^, sqrt, nroot, sin/cos/tan (rad), asin/acos/atan, e, exp, ln, log, log10, pi.",
        iconSvg: iCalc,
        command: "scientificCalc",
        detail: "scientificCalc",
      },
      {
        id: "pythonSandbox",
        label: "Python sandbox",
        description:
          "Run Python in Docker when available, else a temp venv: optional pip packages, code, plots, DataFrame `df`, files in `output/` or cwd. Docker Desktop or host Python for fallback.",
        iconSvg: iPython,
        command: "pythonSandbox",
        detail: "pythonSandbox",
      },
      {
        id: "userSkills",
        label: "User skills",
        description:
          "List, read, write, or delete SKILL.md instructions stored in the app (same as Assistant Settings). Enable skills there to inject them into the system prompt.",
        iconSvg: iSkill,
        command: "skillList",
        detail: "userSkills",
      },
    ],
  },
];
