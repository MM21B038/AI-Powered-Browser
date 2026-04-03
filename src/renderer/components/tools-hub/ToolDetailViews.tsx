import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  buildBrowserSearchPayload,
  buildRunJsPayload,
  buildClickCommandLine,
  buildFillCommandLine,
  buildPressHoldLine,
  buildSelectCommandLine,
  buildTypeCommandLine,
  getToolTemplateLine,
  toolUsesQuickCommand,
} from "../../shared/tools-hub-templates";
import type { ToolsHubCategory, ToolsHubItem } from "../../shared/tools-catalog";
import { CalculatorWidget } from "../CalculatorWidget";

export type ToolsHubBridge = NonNullable<typeof window.legacyBrowser>;
type Bridge = ToolsHubBridge;

export function ToolHero({
  category,
  item,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  onBack: () => void;
}): ReactElement {
  return (
    <header className="tools-hub-tool-header">
      <div className="tools-hub-tool-topbar">
        <button type="button" className="tools-hub-back" onClick={onBack} aria-label="Back to list">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <div className="tools-hub-tool-topbar-spacer" />
        <div className="tools-hub-tool-topbar-title" aria-hidden>
          {item.label}
        </div>
      </div>
      <div className="tools-hub-tool-hero">
        <span className="tools-hub-tool-hero-icon" dangerouslySetInnerHTML={{ __html: item.iconSvg }} />
        <div>
          <h2 className="tools-hub-tool-title">{item.label}</h2>
          <p className="tools-hub-tool-desc">{item.description}</p>
          <p className="tools-hub-tool-cat">{category.title}</p>
        </div>
      </div>
    </header>
  );
}

export function toastResult(bridge: Bridge, r: Awaited<ReturnType<NonNullable<Bridge["dispatchAutomationLine"]>>> | undefined, line: string) {
  if (r && !r.success) {
    bridge.showToast?.(r.error || r.message || "Command failed", 4000);
  } else if (r?.success) {
    bridge.showToast?.(`Ran: ${line}`, 2200);
  }
}

function useActiveSessionId(bridge: Bridge): string {
  const [sid, setSid] = useState(() => bridge.getActiveSessionId?.() || "s_ab12cd");
  useEffect(() => {
    const sync = () => setSid(bridge.getActiveSessionId?.() || "s_ab12cd");
    sync();
    const id = window.setInterval(sync, 250);
    return () => window.clearInterval(id);
  }, [bridge]);
  return sid;
}

export function ToolsHubScrollDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const [step, setStep] = useState<1 | 2>(1);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setStep(2);
      return;
    }
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        setStep(1);
        await delay(1300);
        if (cancelled) break;
        setStep(2);
        await delay(1300);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reduceMotion]);

  const testNow = useCallback(async () => {
    const line = step === 1 ? `scroll down in session ${sid}` : `scroll up in session ${sid}`;
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(line);
      toastResult(bridge, r, line);
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "Scroll failed", 4000);
    }
  }, [bridge, sid, step]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-scroll-demo-label">
        <h3 id="tools-hub-scroll-demo-label" className="tools-hub-tool-h3">
          What it does
        </h3>
        <p className="tools-hub-tool-lead">
          Smooth-scrolls the active page: content moves in the viewport so you can read more above or below.
        </p>
        <ol className="tools-hub-fill-story-steps" aria-hidden>
          <li className={step === 1 ? "tools-hub-fill-story-step--on" : ""}>Scroll down</li>
          <li className={step === 2 ? "tools-hub-fill-story-step--on" : ""}>Scroll up</li>
        </ol>
        <div
          className="tools-hub-scroll-viewport tools-hub-scroll-viewport--story"
          data-phase={step}
          data-reduce-motion={reduceMotion ? "true" : "false"}
          aria-hidden
        >
          <div className="tools-hub-flow-chrome tools-hub-flow-chrome--nav" aria-hidden>
            <span className="tools-hub-flow-dot" />
            <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
            <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
            <span className="tools-hub-flow-spacer" />
            <span className="tools-hub-flow-navhint" aria-hidden>
              {step === 1 ? "Scroll ↓" : "Scroll ↑"}
            </span>
          </div>
          <div className="tools-hub-scroll-clip">
            <div className="tools-hub-scroll-strip">
              <span className="tools-hub-scroll-line" />
              <span className="tools-hub-scroll-line" />
              <span className="tools-hub-scroll-line tools-hub-scroll-line--accent" />
              <span className="tools-hub-scroll-line" />
              <span className="tools-hub-scroll-line" />
              <span className="tools-hub-scroll-line" />
              <span className="tools-hub-scroll-line tools-hub-scroll-line--w2" />
              <span className="tools-hub-scroll-line" />
              <span className="tools-hub-scroll-line tools-hub-scroll-line--w3" />
              <span className="tools-hub-scroll-line" />
            </div>
            <div className="tools-hub-scroll-scrollbar" aria-hidden>
              <span className="tools-hub-scroll-thumb" />
            </div>
          </div>
        </div>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-scroll-cmd-label">
        <h3 id="tools-hub-scroll-cmd-label" className="tools-hub-tool-h3">
          Command format
        </h3>
        <p className="tools-hub-tool-hint">Type in chat or run from here. Matching is case-insensitive.</p>
        <pre className="tools-hub-tool-pre" tabIndex={0}>
          {`scroll down in session ${sid}\nscroll up in session ${sid}`}
        </pre>
        <p className="tools-hub-tool-output-hint">
          Result: automation runs <code>window.scrollBy</code> with smooth behavior.
        </p>
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function truncateSelector(sel: string, max = 26): string {
  const t = sel.trim() || "#field";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

const FILL_DEMO_LABELS = ["Full name", "Work email", "Phone", "Company", "Notes"];

function ToolsHubClickDemoStory({ selector }: { selector: string }): ReactElement {
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(4);
      return;
    }
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        setPhase(1);
        await delay(580);
        if (cancelled) break;
        setPhase(2);
        await delay(1150);
        if (cancelled) break;
        setPhase(3);
        await delay(1450);
        if (cancelled) break;
        setPhase(4);
        await delay(2400);
        if (cancelled) break;
        await delay(1400);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selector, reduceMotion]);

  const badge = truncateSelector(selector);
  const dimFields = phase >= 2;

  return (
    <div
      className="tools-hub-click-story"
      data-phase={phase}
      data-reduce-motion={reduceMotion ? "true" : "false"}
      aria-hidden
    >
      <ol className="tools-hub-fill-story-steps tools-hub-click-story-steps">
        <li className={phase >= 2 ? "tools-hub-fill-story-step--on" : ""}>Find selector on page</li>
        <li className={phase >= 3 ? "tools-hub-fill-story-step--on" : ""}>Focus &amp; zoom</li>
        <li className={phase >= 4 ? "tools-hub-fill-story-step--on" : ""}>Pointer &amp; click</li>
      </ol>
      <div className="tools-hub-click-viewport">
        <div className="tools-hub-fill-browser-chrome" />
        <div className="tools-hub-click-zoom-layer">
          <div className="tools-hub-click-page">
            <div
              className={
                "tools-hub-click-field-row" + (dimFields ? " tools-hub-click-field-row--dim" : "")
              }
            >
              <span className="tools-hub-fill-field-label-mini">Email</span>
              <div className="tools-hub-fill-fake-bar" />
            </div>
            <div
              className={
                "tools-hub-click-field-row" + (dimFields ? " tools-hub-click-field-row--dim" : "")
              }
            >
              <span className="tools-hub-fill-field-label-mini">Password</span>
              <div className="tools-hub-fill-fake-bar" />
            </div>
            <div className="tools-hub-click-submit-block">
              <span
                className={
                  "tools-hub-click-match-badge" + (phase >= 2 ? " tools-hub-click-match-badge--on" : "")
                }
              >
                {badge}
              </span>
              <div
                className={
                  "tools-hub-click-submit-target" +
                  (phase === 2 ? " tools-hub-click-submit-target--ring" : "")
                }
              >
                <button type="button" className="tools-hub-click-fake-submit" tabIndex={-1}>
                  Submit
                </button>
              </div>
            </div>
          </div>
          <div className="tools-hub-click-mouse-layer">
            <div key={phase} className={"tools-hub-click-mouse" + (phase === 4 ? " tools-hub-click-mouse--animate" : "")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 3l14 10-6 1-2 6L5 3z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeOpacity={0.35}
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsHubFillDemoStory({
  selector,
  value,
}: {
  selector: string;
  value: string;
}): ReactElement {
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [typedDemo, setTypedDemo] = useState("");
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const demoText = useMemo(() => {
    const t = (value || "").trim();
    return t.length ? t : "Hello";
  }, [value]);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(4);
      setTypedDemo(demoText);
      return;
    }
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        setPhase(1);
        setTypedDemo("");
        await delay(650);
        if (cancelled) break;
        setPhase(2);
        await delay(1200);
        if (cancelled) break;
        setPhase(3);
        await delay(1600);
        if (cancelled) break;
        setPhase(4);
        setTypedDemo(demoText);
        await delay(2200);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selector, value, demoText, reduceMotion]);

  const badge = truncateSelector(selector);
  const dimOthers = phase >= 2;

  return (
    <div
      className="tools-hub-fill-story"
      data-phase={phase}
      data-reduce-motion={reduceMotion ? "true" : "false"}
      aria-hidden
    >
      <ol className="tools-hub-fill-story-steps">
        <li className={phase >= 2 ? "tools-hub-fill-story-step--on" : ""}>Find selector on page</li>
        <li className={phase >= 3 ? "tools-hub-fill-story-step--on" : ""}>Focus &amp; zoom</li>
        <li className={phase >= 4 ? "tools-hub-fill-story-step--on" : ""}>Apply value</li>
      </ol>
      <div className="tools-hub-fill-viewport">
        <div className="tools-hub-fill-browser-chrome" />
        <div className="tools-hub-fill-zoom-layer">
          <div className="tools-hub-fill-page">
            {FILL_DEMO_LABELS.map((label, i) => {
              const isTarget = i === 1;
              return (
                <div
                  key={label}
                  className={
                    "tools-hub-fill-field-row" +
                    (isTarget ? " tools-hub-fill-field-row--target" : "") +
                    (dimOthers && !isTarget ? " tools-hub-fill-field-row--dim" : "")
                  }
                >
                  <span className="tools-hub-fill-field-label-mini">{label}</span>
                  {isTarget ? (
                    <div className="tools-hub-fill-target-cell">
                      <span
                        className={
                          "tools-hub-fill-match-badge" + (phase >= 2 ? " tools-hub-fill-match-badge--on" : "")
                        }
                      >
                        {badge}
                      </span>
                      <div
                        className={
                          "tools-hub-fill-fake-input" +
                          (phase >= 4 && typedDemo.length > 0 ? " tools-hub-fill-fake-input--applied" : "")
                        }
                      >
                        <span className="tools-hub-fill-fake-text">{typedDemo}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="tools-hub-fill-fake-bar" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsHubTypeDemoStory({ selector, text }: { selector: string; text: string }): ReactElement {
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [typedDemo, setTypedDemo] = useState("");
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const demoText = useMemo(() => {
    const t = (text || "").trim();
    return t.length ? t : "Hello";
  }, [text]);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(4);
      setTypedDemo(demoText);
      return;
    }
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        setPhase(1);
        setTypedDemo("");
        await delay(650);
        if (cancelled) break;
        setPhase(2);
        await delay(1200);
        if (cancelled) break;
        setPhase(3);
        await delay(1600);
        if (cancelled) break;
        setPhase(4);
        const full = demoText;
        const baseMin = 28;
        const baseMax = 120;
        const mistakeRate = 0.06;
        const rand = (a: number, b: number) =>
          Math.floor(a + Math.random() * (b - a + 1));
        const wrongCharFor = (ch: string) => {
          const alpha = "abcdefghijklmnopqrstuvwxyz";
          const low = ch.toLowerCase();
          const i = alpha.indexOf(low);
          if (i === -1) return "x";
          const j = (i + rand(1, 5)) % alpha.length;
          const out = alpha[j];
          return ch === low ? out : out.toUpperCase();
        };
        const extraPauseFor = (ch: string) => {
          if (ch === " ") return rand(70, 220);
          if (/[.,;:!?]/.test(ch)) return rand(120, 360);
          return 0;
        };

        let cur = "";
        setTypedDemo(cur);
        for (let i = 0; i < full.length; i++) {
          if (cancelled) return;
          const ch = full[i];

          if (Math.random() < mistakeRate && /[a-zA-Z]/.test(ch)) {
            cur += wrongCharFor(ch);
            setTypedDemo(cur);
            await delay(rand(baseMin, baseMax));
            cur = cur.slice(0, -1);
            setTypedDemo(cur);
            await delay(rand(60, 160));
          }

          cur += ch;
          setTypedDemo(cur);
          await delay(rand(baseMin, baseMax) + extraPauseFor(ch));
        }
        await delay(2000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [text, demoText, reduceMotion]);

  const dimOthers = phase >= 2;
  const selTrim = selector.trim();
  const badge = truncateSelector(selTrim || "#selector");

  return (
    <div
      className="tools-hub-fill-story tools-hub-type-story"
      data-phase={phase}
      data-has-selector={selTrim ? "true" : "false"}
      data-reduce-motion={reduceMotion ? "true" : "false"}
      aria-hidden
    >
      <ol className="tools-hub-fill-story-steps">
        <li className={phase >= 2 ? "tools-hub-fill-story-step--on" : ""}>Target field</li>
        <li className={phase >= 3 ? "tools-hub-fill-story-step--on" : ""}>Focus &amp; zoom</li>
        <li className={phase >= 4 ? "tools-hub-fill-story-step--on" : ""}>Type text</li>
      </ol>
      <div className="tools-hub-fill-viewport">
        <div className="tools-hub-fill-browser-chrome" />
        <div className="tools-hub-fill-zoom-layer">
          <div className="tools-hub-fill-page">
            {FILL_DEMO_LABELS.map((label, i) => {
              const isTarget = i === 1;
              return (
                <div
                  key={label}
                  className={
                    "tools-hub-fill-field-row" +
                    (isTarget ? " tools-hub-fill-field-row--target" : "") +
                    (dimOthers && !isTarget ? " tools-hub-fill-field-row--dim" : "")
                  }
                >
                  <span className="tools-hub-fill-field-label-mini">{label}</span>
                  {isTarget ? (
                    <div className="tools-hub-fill-target-cell">
                      <span
                        className={
                          "tools-hub-fill-match-badge tools-hub-type-focus-badge" +
                          (phase >= 2 ? " tools-hub-fill-match-badge--on" : "")
                        }
                      >
                        {badge}
                      </span>
                      <div className="tools-hub-fill-fake-input">
                        <span className="tools-hub-fill-fake-text">{typedDemo}</span>
                        {phase >= 4 ? <span className="tools-hub-fill-fake-caret" /> : null}
                      </div>
                    </div>
                  ) : (
                    <div className="tools-hub-fill-fake-bar" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const SELECT_DEMO_OPTIONS: readonly { label: string; value: string }[] = [
  { label: "Canada", value: "ca" },
  { label: "United States", value: "us" },
  { label: "Mexico", value: "mx" },
];

const PATH_DEMO_GROUPS: readonly { name: string; children: readonly string[] }[] = [
  { name: "Americas", children: ["Canada", "Brazil"] },
  { name: "Europe", children: ["France", "Germany"] },
];

function ToolsHubSelectPathDemoStory({ selector, pathStr }: { selector: string; pathStr: string }): ReactElement {
  const parsed = useMemo(() => {
    const segments = pathStr.split(">").map((s) => s.trim()).filter(Boolean);
    const g =
      PATH_DEMO_GROUPS.find(
        (x) => segments[0] && x.name.toLowerCase().includes(segments[0].toLowerCase()),
      ) ?? PATH_DEMO_GROUPS[0];
    const child =
      g.children.find(
        (c) => segments[1] && c.toLowerCase().includes(segments[1].toLowerCase()),
      ) ?? g.children[0];
    return { group: g, child };
  }, [pathStr]);

  const [phase, setPhase] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(5);
      return;
    }
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        setPhase(1);
        await delay(650);
        if (cancelled) break;
        setPhase(2);
        await delay(900);
        if (cancelled) break;
        setPhase(3);
        await delay(1000);
        if (cancelled) break;
        setPhase(4);
        await delay(1000);
        if (cancelled) break;
        setPhase(5);
        await delay(2100);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selector, pathStr, parsed.group.name, parsed.child, reduceMotion]);

  const badge = truncateSelector(selector);
  const dimOthers = phase >= 2;
  const menuOpen = phase >= 3;
  const showTier2 = phase >= 4;

  return (
    <div
      className="tools-hub-fill-story tools-hub-select-story"
      data-phase={phase}
      data-reduce-motion={reduceMotion ? "true" : "false"}
      aria-hidden
    >
      <ol className="tools-hub-fill-story-steps">
        <li className={phase >= 2 ? "tools-hub-fill-story-step--on" : ""}>Find control</li>
        <li className={phase >= 3 ? "tools-hub-fill-story-step--on" : ""}>Open menu</li>
        <li className={phase >= 4 ? "tools-hub-fill-story-step--on" : ""}>First level</li>
        <li className={phase >= 5 ? "tools-hub-fill-story-step--on" : ""}>Nested choice</li>
      </ol>
      <div className="tools-hub-fill-viewport">
        <div className="tools-hub-fill-browser-chrome" />
        <div className="tools-hub-fill-zoom-layer">
          <div className="tools-hub-fill-page">
            {FILL_DEMO_LABELS.map((label, i) => {
              const isTarget = i === 1;
              return (
                <div
                  key={label}
                  className={
                    "tools-hub-fill-field-row" +
                    (isTarget ? " tools-hub-fill-field-row--target" : "") +
                    (dimOthers && !isTarget ? " tools-hub-fill-field-row--dim" : "")
                  }
                >
                  <span className="tools-hub-fill-field-label-mini">{label}</span>
                  {isTarget ? (
                    <div className="tools-hub-fill-target-cell tools-hub-select-target">
                      <span
                        className={
                          "tools-hub-fill-match-badge" + (phase >= 2 ? " tools-hub-fill-match-badge--on" : "")
                        }
                      >
                        {badge}
                      </span>
                      <div className="tools-hub-select-control-wrap">
                        <div
                          className={
                            "tools-hub-select-fake" + (phase >= 2 ? " tools-hub-select-fake--focus" : "")
                          }
                        >
                          <span className="tools-hub-select-fake-label">
                            {phase >= 5 ? parsed.child : "Choose region…"}
                          </span>
                          <span className="tools-hub-select-fake-caret" aria-hidden>
                            ▾
                          </span>
                        </div>
                        {menuOpen ? (
                          <div
                            className="tools-hub-select-fake-menu tools-hub-select-fake-menu--path"
                            role="presentation"
                          >
                            <ul className="tools-hub-select-fake-col" role="listbox">
                              {PATH_DEMO_GROUPS.map((g) => (
                                <li
                                  key={g.name}
                                  className={
                                    "tools-hub-select-fake-opt" +
                                    (phase >= 4 && g.name === parsed.group.name
                                      ? " tools-hub-select-fake-opt--hl"
                                      : "") +
                                    (phase >= 5 && g.name === parsed.group.name
                                      ? " tools-hub-select-fake-opt--picked"
                                      : "")
                                  }
                                >
                                  {g.name}
                                </li>
                              ))}
                            </ul>
                            {showTier2 ? (
                              <ul
                                className="tools-hub-select-fake-col tools-hub-select-fake-col--sub"
                                role="listbox"
                              >
                                {parsed.group.children.map((c) => (
                                  <li
                                    key={c}
                                    className={
                                      "tools-hub-select-fake-opt" +
                                      (phase >= 5 && c === parsed.child
                                        ? " tools-hub-select-fake-opt--hl tools-hub-select-fake-opt--picked"
                                        : "")
                                    }
                                  >
                                    {c}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="tools-hub-fill-fake-bar" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsHubSelectDemoStory({
  selector,
  by,
  choice,
}: {
  selector: string;
  by: "label" | "value" | "index" | "path";
  choice: string;
}): ReactElement {
  if (by === "path") {
    return <ToolsHubSelectPathDemoStory selector={selector} pathStr={choice} />;
  }
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const resolved = useMemo(() => {
    if (by === "index") {
      const i = Math.max(0, Math.min(SELECT_DEMO_OPTIONS.length - 1, parseInt(choice, 10) || 0));
      return { label: SELECT_DEMO_OPTIONS[i].label, value: SELECT_DEMO_OPTIONS[i].value, index: i };
    }
    if (by === "value") {
      const v = choice.trim().toLowerCase();
      const o = SELECT_DEMO_OPTIONS.find((x) => x.value === v) ?? SELECT_DEMO_OPTIONS[0];
      const i = SELECT_DEMO_OPTIONS.indexOf(o);
      return { label: o.label, value: o.value, index: i };
    }
    const t = choice.trim().toLowerCase();
    const o = SELECT_DEMO_OPTIONS.find((x) => x.label.toLowerCase().includes(t)) ?? SELECT_DEMO_OPTIONS[0];
    const i = SELECT_DEMO_OPTIONS.indexOf(o);
    return { label: o.label, value: o.value, index: i };
  }, [by, choice]);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(4);
      return;
    }
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        setPhase(1);
        await delay(650);
        if (cancelled) break;
        setPhase(2);
        await delay(1100);
        if (cancelled) break;
        setPhase(3);
        await delay(1400);
        if (cancelled) break;
        setPhase(4);
        await delay(2200);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selector, by, choice, resolved.label, reduceMotion]);

  const badge = truncateSelector(selector);
  const dimOthers = phase >= 2;
  const menuOpen = phase >= 3;

  return (
    <div
      className="tools-hub-fill-story tools-hub-select-story"
      data-phase={phase}
      data-reduce-motion={reduceMotion ? "true" : "false"}
      aria-hidden
    >
      <ol className="tools-hub-fill-story-steps">
        <li className={phase >= 2 ? "tools-hub-fill-story-step--on" : ""}>Find select on page</li>
        <li className={phase >= 3 ? "tools-hub-fill-story-step--on" : ""}>Focus &amp; open list</li>
        <li className={phase >= 4 ? "tools-hub-fill-story-step--on" : ""}>Choose option &amp; change</li>
      </ol>
      <div className="tools-hub-fill-viewport">
        <div className="tools-hub-fill-browser-chrome" />
        <div className="tools-hub-fill-zoom-layer">
          <div className="tools-hub-fill-page">
            {FILL_DEMO_LABELS.map((label, i) => {
              const isTarget = i === 1;
              return (
                <div
                  key={label}
                  className={
                    "tools-hub-fill-field-row" +
                    (isTarget ? " tools-hub-fill-field-row--target" : "") +
                    (dimOthers && !isTarget ? " tools-hub-fill-field-row--dim" : "")
                  }
                >
                  <span className="tools-hub-fill-field-label-mini">{label}</span>
                  {isTarget ? (
                    <div className="tools-hub-fill-target-cell tools-hub-select-target">
                      <span
                        className={
                          "tools-hub-fill-match-badge" + (phase >= 2 ? " tools-hub-fill-match-badge--on" : "")
                        }
                      >
                        {badge}
                      </span>
                      <div className="tools-hub-select-control-wrap">
                        <div
                          className={
                            "tools-hub-select-fake" + (phase >= 2 ? " tools-hub-select-fake--focus" : "")
                          }
                        >
                          <span className="tools-hub-select-fake-label">
                            {phase >= 4 ? resolved.label : "Choose…"}
                          </span>
                          <span className="tools-hub-select-fake-caret" aria-hidden>
                            ▾
                          </span>
                        </div>
                        {menuOpen ? (
                          <ul className="tools-hub-select-fake-menu" role="listbox">
                            {SELECT_DEMO_OPTIONS.map((opt, j) => (
                              <li
                                key={opt.value}
                                className={
                                  "tools-hub-select-fake-opt" +
                                  (phase >= 3 && j === resolved.index ? " tools-hub-select-fake-opt--hl" : "") +
                                  (phase >= 4 && j === resolved.index ? " tools-hub-select-fake-opt--picked" : "")
                                }
                              >
                                {opt.label}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="tools-hub-fill-fake-bar" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToolsHubSelectDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const [selector, setSelector] = useState("Region");
  const [by, setBy] = useState<"label" | "value" | "index" | "path">("path");
  const [choice, setChoice] = useState("Americas > Canada");
  const line = useMemo(() => buildSelectCommandLine(selector, by, choice, sid), [selector, by, choice, sid]);

  const testNow = useCallback(async () => {
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(line);
      toastResult(bridge, r, line);
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "Select failed", 4000);
    }
  }, [bridge, line]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-select-demo-label">
        <h3 id="tools-hub-select-demo-label" className="tools-hub-tool-h3">
          What it does
        </h3>
        <p className="tools-hub-tool-lead">
          Resolves the target like <strong>click</strong> (CSS selector or visible label on native{" "}
          <code>select</code>, combobox, or <code>label</code> association). Uses label, value, or index on native
          elements; <strong>by path</strong> opens custom menus and clicks each segment (e.g.{" "}
          <code>Region &gt; Country</code>). Preview below.
        </p>
        <ToolsHubSelectDemoStory selector={selector} by={by} choice={choice} />
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-select-fields-label">
        <h3 id="tools-hub-select-fields-label" className="tools-hub-tool-h3">
          Try it
        </h3>
        <p className="tools-hub-tool-hint">
          Edit target (selector or label text), matching mode, and choice; the command updates below. Custom menus and
          Shadow-heavy UIs may still need the picker.
        </p>
        <div className="tools-hub-fill-fields">
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Target (selector or label)</span>
            <input
              className="tools-hub-fill-input-editable"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="#country or Region"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Match by</span>
            <select
              className="tools-hub-fill-input-editable tools-hub-select-by-input"
              value={by}
              onChange={(e) => setBy(e.target.value as "label" | "value" | "index" | "path")}
            >
              <option value="label">label (visible text)</option>
              <option value="value">value (option value)</option>
              <option value="index">index (0-based)</option>
              <option value="path">path (nested, Level1 &gt; Level2)</option>
            </select>
          </label>
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">
              {by === "index" ? "Index" : by === "path" ? "Path" : "Choice"}
            </span>
            {by === "path" ? (
              <textarea
                className="tools-hub-fill-input-editable tools-hub-select-path-input"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                placeholder={'Americas > Canada (quote in command if spaces)'}
                spellCheck={false}
                autoComplete="off"
                rows={2}
              />
            ) : (
              <input
                className="tools-hub-fill-input-editable"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                placeholder={by === "index" ? "0" : by === "value" ? "ca" : "Canada"}
                spellCheck={false}
                autoComplete="off"
                inputMode={by === "index" ? "numeric" : undefined}
              />
            )}
          </label>
        </div>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-select-cmd-label">
        <h3 id="tools-hub-select-cmd-label" className="tools-hub-tool-h3">
          Command format
        </h3>
        <pre className="tools-hub-tool-pre tools-hub-tool-pre--typing" tabIndex={0}>
          {line}
        </pre>
        <p className="tools-hub-tool-output-hint">
          Natural language: <code>select</code> … <code>by label|value|index|path</code> … Quote paths when segments
          contain spaces. Native <code>select</code> supports one path segment only; use label/value/index for flat
          options.
        </p>
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function ToolsHubFillDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const [selector, setSelector] = useState("#email");
  const [value, setValue] = useState("Hello");
  const line = buildFillCommandLine(selector, value, sid);

  const testNow = useCallback(async () => {
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(line);
      toastResult(bridge, r, line);
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "Fill failed", 4000);
    }
  }, [bridge, line]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-fill-demo-label">
        <h3 id="tools-hub-fill-demo-label" className="tools-hub-tool-h3">
          What it does
        </h3>
        <p className="tools-hub-tool-lead">
          Resolves your CSS selector among other fields, scrolls it into view, focuses it, then sets the value in one
          step—shown below as match, zoom, and apply.
        </p>
        <ToolsHubFillDemoStory selector={selector} value={value} />
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-fill-fields-label">
        <h3 id="tools-hub-fill-fields-label" className="tools-hub-tool-h3">
          Try it
        </h3>
        <p className="tools-hub-tool-hint">Edit selector and value; the command updates below.</p>
        <div className="tools-hub-fill-fields">
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">CSS selector</span>
            <input
              className="tools-hub-fill-input-editable"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="#id, .class, [name=…]"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Value</span>
            <input
              className="tools-hub-fill-input-editable"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Text to insert"
              spellCheck={false}
            />
          </label>
        </div>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-fill-cmd-label">
        <h3 id="tools-hub-fill-cmd-label" className="tools-hub-tool-h3">
          Command format
        </h3>
        <pre className="tools-hub-tool-pre tools-hub-tool-pre--typing" tabIndex={0}>
          {line}
        </pre>
        <p className="tools-hub-tool-output-hint">
          Natural language: <code>fill</code> / <code>type into</code> / <code>type in</code> … <code>with</code> …
        </p>
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function ToolsHubTypeDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const [selector, setSelector] = useState("#email");
  const [text, setText] = useState("Hello");
  const line = buildTypeCommandLine(selector, text, sid);

  const testNow = useCallback(async () => {
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(line);
      toastResult(bridge, r, line);
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "Type failed", 4000);
    }
  }, [bridge, line]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-type-demo-label">
        <h3 id="tools-hub-type-demo-label" className="tools-hub-tool-h3">
          What it does
        </h3>
        <p className="tools-hub-tool-lead">
          Targets a specific field by CSS selector (scrolls + focuses it), then types like a human—shown below as target,
          zoom, and human typing (with occasional corrections).
        </p>
        <ToolsHubTypeDemoStory selector={selector} text={text} />
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-type-fields-label">
        <h3 id="tools-hub-type-fields-label" className="tools-hub-tool-h3">
          Try it
        </h3>
        <p className="tools-hub-tool-hint">CSS selector is required: the tool finds the field, focuses it, then types.</p>
        <div className="tools-hub-fill-fields">
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">CSS selector</span>
            <input
              className="tools-hub-fill-input-editable"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="#email"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Text to type</span>
            <input
              className="tools-hub-fill-input-editable"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Text to send"
              spellCheck={false}
            />
          </label>
        </div>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-type-cmd-label">
        <h3 id="tools-hub-type-cmd-label" className="tools-hub-tool-h3">
          Command format
        </h3>
        <pre className="tools-hub-tool-pre tools-hub-tool-pre--typing" tabIndex={0}>
          {line}
        </pre>
        <p className="tools-hub-tool-output-hint">
          Use <code>type into ... with ...</code> to target the field and type like a human.
        </p>
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function ToolsHubClickDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const [selector, setSelector] = useState("#submit");
  const line = buildClickCommandLine(selector, sid);

  const testNow = useCallback(async () => {
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(line);
      toastResult(bridge, r, line);
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "Click failed", 4000);
    }
  }, [bridge, line]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-click-demo-label">
        <h3 id="tools-hub-click-demo-label" className="tools-hub-tool-h3">
          What it does
        </h3>
        <p className="tools-hub-tool-lead">
          Resolves your selector on the page, brings the element into view, then performs a click—shown below as match,
          zoom on the button, and a pointer press.
        </p>
        <ToolsHubClickDemoStory selector={selector} />
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-click-fields-label">
        <h3 id="tools-hub-click-fields-label" className="tools-hub-tool-h3">
          Try it
        </h3>
        <p className="tools-hub-tool-hint">Edit the selector; the command line and preview update.</p>
        <div className="tools-hub-fill-fields">
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">CSS selector</span>
            <input
              className="tools-hub-fill-input-editable"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="#id, button[type=submit], …"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        </div>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-click-cmd-label">
        <h3 id="tools-hub-click-cmd-label" className="tools-hub-tool-h3">
          Command format
        </h3>
        <pre className="tools-hub-tool-pre tools-hub-tool-pre--typing" tabIndex={0}>
          {line}
        </pre>
        <p className="tools-hub-tool-output-hint">
          Natural language: <code>click</code> … (selector or visible text). Quick panel can also start the element
          picker first.
        </p>
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function ToolsHubPressDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const [selector, setSelector] = useState("#submit");
  const [holdMs, setHoldMs] = useState(1200);
  const line = buildPressHoldLine(selector, holdMs, sid);
  const testNow = useCallback(async () => {
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(line);
      toastResult(bridge, r, line);
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "Press failed", 4000);
    }
  }, [bridge, line]);
  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />
      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">What it does</h3>
        <p className="tools-hub-tool-lead">Finds a target element, holds pointer down for the provided time, then releases.</p>
      </section>
      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">Try it</h3>
        <div className="tools-hub-fill-fields">
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">CSS selector</span>
            <input className="tools-hub-fill-input-editable" value={selector} onChange={(e) => setSelector(e.target.value)} />
          </label>
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Hold (ms)</span>
            <input
              className="tools-hub-fill-input-editable"
              type="number"
              min={100}
              step={100}
              value={holdMs}
              onChange={(e) => setHoldMs(Number(e.target.value || 1200))}
            />
          </label>
        </div>
      </section>
      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">Command format</h3>
        <pre className="tools-hub-tool-pre tools-hub-tool-pre--typing">{line}</pre>
      </section>
      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function ToolsHubSessionDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const [headless, setHeadless] = useState(false);
  const [lastOutput, setLastOutput] = useState<string>("");
  const line =
    item.command === "killSession"
      ? `kill session ${sid}`
      : `session headless ${headless ? "true" : "false"}`;
  const testNow = useCallback(async () => {
    if (item.command === "killSession") return;
    try {
      const r = await bridge.dispatchAutomationLine?.(line);
      if (r?.data && typeof r.data === "object" && "id" in (r.data as Record<string, unknown>)) {
        const out = r.data as { id: string; headless: boolean };
        setLastOutput(JSON.stringify({ id: out.id, headless: out.headless }, null, 2));
        bridge.showToast?.(`Created ${out.id}`, 2500);
      } else {
        toastResult(bridge, r, line);
      }
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "Session command failed", 4000);
    }
  }, [bridge, item.command, line]);
  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />
      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">What it does</h3>
        <p className="tools-hub-tool-lead">
          Creates isolated browser sessions and returns a session id. Use that id with all commands in this hub.
        </p>
      </section>
      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">Command format</h3>
        {item.command === "session" ? (
          <>
            <p className="tools-hub-tool-hint">Choose whether the created session is visible or headless.</p>
            <div className="tools-hub-dir-toggle" role="group" aria-label="Headless mode">
              <button
                type="button"
                className={"tools-hub-dir-btn" + (!headless ? " tools-hub-dir-btn--active" : "")}
                onClick={() => setHeadless(false)}
              >
                false (visible)
              </button>
              <button
                type="button"
                className={"tools-hub-dir-btn" + (headless ? " tools-hub-dir-btn--active" : "")}
                onClick={() => setHeadless(true)}
              >
                true (headless)
              </button>
            </div>
          </>
        ) : null}
        <pre className="tools-hub-tool-pre">{line}</pre>
      </section>
      {item.command === "session" ? (
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">Output format</h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>{`{\n  "id": "s_xxxxxx",\n  "headless": ${headless ? "true" : "false"}\n}`}</pre>
          {lastOutput ? (
            <>
              <p className="tools-hub-tool-hint">Last result</p>
              <pre className="tools-hub-tool-pre tools-hub-tool-pre--io" tabIndex={0}>
                {lastOutput}
              </pre>
            </>
          ) : null}
        </section>
      ) : null}
      {item.command === "session" ? (
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
            Test now
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ToolsHubRunJsDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const [script, setScript] = useState(
    "const links = Array.from(document.querySelectorAll('a')).slice(0, 5).map((a) => a.href);\nreturn { title: document.title, links };",
  );
  const [argsJson, setArgsJson] = useState("{\n  \"note\": \"optional\"\n}");
  const [timeoutMs, setTimeoutMs] = useState(8000);
  const [lastOutput, setLastOutput] = useState("");

  const payload = useMemo(() => buildRunJsPayload(script, argsJson, timeoutMs, sid), [script, argsJson, timeoutMs, sid]);

  const testNow = useCallback(async () => {
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(payload);
      if (r?.data !== undefined) {
        setLastOutput(JSON.stringify(r.data, null, 2));
      } else if (r?.message) {
        setLastOutput(r.message);
      } else {
        setLastOutput("");
      }
      toastResult(bridge, r, "run_js");
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "run_js failed", 4000);
    }
  }, [bridge, payload]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-runjs-demo-label">
        <h3 id="tools-hub-runjs-demo-label" className="tools-hub-tool-h3">
          What it does
        </h3>
        <p className="tools-hub-tool-lead">
          Executes your JavaScript in the active page context and returns the result. Use it for custom actions,
          extraction, and diagnostics when built-in tools are not enough.
        </p>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-runjs-fields-label">
        <h3 id="tools-hub-runjs-fields-label" className="tools-hub-tool-h3">
          Try it
        </h3>
        <p className="tools-hub-tool-hint">
          Script is a JavaScript function body with optional <code>args</code>. Return any JSON-serializable value.
        </p>
        <div className="tools-hub-fill-fields">
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Script</span>
            <textarea
              className="tools-hub-fill-input-editable tools-hub-runjs-input"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={7}
              spellCheck={false}
            />
          </label>
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Args (JSON optional)</span>
            <textarea
              className="tools-hub-fill-input-editable tools-hub-runjs-input"
              value={argsJson}
              onChange={(e) => setArgsJson(e.target.value)}
              rows={4}
              spellCheck={false}
            />
          </label>
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Timeout (ms)</span>
            <input
              className="tools-hub-fill-input-editable"
              type="number"
              min={200}
              max={30000}
              step={100}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Math.max(200, Math.min(30000, Number(e.target.value) || 8000)))}
            />
          </label>
        </div>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-runjs-payload-label">
        <h3 id="tools-hub-runjs-payload-label" className="tools-hub-tool-h3">
          Payload preview
        </h3>
        <pre className="tools-hub-tool-pre tools-hub-tool-pre--io" tabIndex={0}>
          {payload}
        </pre>
        <p className="tools-hub-tool-output-hint">
          This sends JSON mode command <code>op: &quot;run_js&quot;</code> through the same automation pipeline.
        </p>
        {lastOutput ? (
          <>
            <p className="tools-hub-tool-hint">Last result</p>
            <pre className="tools-hub-tool-pre tools-hub-tool-pre--io" tabIndex={0}>
              {lastOutput}
            </pre>
          </>
        ) : null}
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function ToolsHubBrowserSearchDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const [query, setQuery] = useState("autonomous browser");
  const [limit, setLimit] = useState(5);
  const [lastOutput, setLastOutput] = useState("");
  const payload = useMemo(() => buildBrowserSearchPayload(query, limit), [query, limit]);

  const testNow = useCallback(async () => {
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(payload);
      setLastOutput(r?.message || (r?.data ? JSON.stringify(r.data, null, 2) : ""));
      toastResult(bridge, r, "browser_search");
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "browser_search failed", 4000);
    }
  }, [bridge, payload]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />
      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">Try it</h3>
        <div className="tools-hub-fill-fields">
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Query</span>
            <input className="tools-hub-fill-input-editable" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="tools-hub-fill-field">
            <span className="tools-hub-fill-field-label">Limit (max 5)</span>
            <input
              className="tools-hub-fill-input-editable"
              type="number"
              min={1}
              max={5}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(5, Number(e.target.value) || 5)))}
            />
          </label>
        </div>
      </section>
      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">Payload preview</h3>
        <pre className="tools-hub-tool-pre tools-hub-tool-pre--io">{payload}</pre>
        {lastOutput ? (
          <>
            <p className="tools-hub-tool-hint">Last result</p>
            <pre className="tools-hub-tool-pre tools-hub-tool-pre--io">{lastOutput}</pre>
          </>
        ) : null}
      </section>
      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function ToolsHubScientificCalcDetail({
  category,
  item,
  bridge: _bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  void _bridge;
  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />
      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">Calculator</h3>
        <p className="tools-hub-tool-hint">
          Same keypad as in the assistant panel. Trig uses radians; use <code className="tools-hub-inline-code">sin</code>, <code className="tools-hub-inline-code">pi</code>,{" "}
          <code className="tools-hub-inline-code">ln</code>, <code className="tools-hub-inline-code">log10</code>, etc. in the expression. The AI tool <code className="tools-hub-inline-code">intelligent_scientific_calculate</code> still takes{" "}
          <code className="tools-hub-inline-code">expression</code> as a string in JSON.
        </p>
        <CalculatorWidget variant="embedded" showPrecisionControl />
      </section>
    </div>
  );
}

const DEMO_CLASS: Partial<Record<string, string>> = {
  screenshot: "tools-hub-simple-demo--shot",
  tabs: "tools-hub-simple-demo--tabs",
  url: "tools-hub-simple-demo--url",
};

export function ToolsHubGenericDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: Bridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const cmd = item.command;
  const quick = toolUsesQuickCommand(cmd);
  const templateLine = getToolTemplateLine(cmd, sid);
  const demoClass = DEMO_CLASS[cmd] ?? "tools-hub-simple-demo--pulse";

  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (quick) {
      setTyped("");
      return;
    }
    const full = templateLine;
    if (!full.length) {
      setTyped("");
      return;
    }
    setTyped("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i >= full.length) window.clearInterval(id);
    }, 28);
    return () => {
      window.clearInterval(id);
    };
  }, [cmd, quick, templateLine]);

  const testNow = useCallback(async () => {
    if (quick) {
      bridge.runQuickCommand?.(cmd, { closeHub: true });
      return;
    }
    const line = templateLine.trim();
    if (!line) {
      bridge.showToast?.("No command line for this tool", 2500);
      return;
    }
    try {
      bridge.closeToolsHub?.();
      await delay(60);
      const r = await bridge.dispatchAutomationLine?.(line);
      toastResult(bridge, r, line);
    } catch (e) {
      bridge.showToast?.(e instanceof Error ? e.message : "Command failed", 4000);
    }
  }, [bridge, cmd, quick, templateLine]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">What it does</h3>
        <p className="tools-hub-tool-lead">{item.description}</p>
        <div className={"tools-hub-simple-demo " + demoClass} aria-hidden>
          <div className="tools-hub-simple-demo-inner" />
        </div>
      </section>

      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">Command format</h3>
        {quick ? (
          <>
            <p className="tools-hub-tool-hint">
              This action is wired like the Quick panel: it toggles a browser tool or picker on the page.
            </p>
            <pre className="tools-hub-tool-pre">Quick / Tools: {cmd}</pre>
          </>
        ) : (
          <>
            <p className="tools-hub-tool-hint">Example line sent to the automation engine (typed preview).</p>
            <pre className="tools-hub-tool-pre tools-hub-tool-pre--typing" tabIndex={0}>
              {typed}
              <span className="tools-hub-caret" />
            </pre>
          </>
        )}
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          {quick ? "Run (same as Quick)" : "Test now"}
        </button>
      </div>
    </div>
  );
}
