import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import type { ToolsHubCategory, ToolsHubItem } from "../../shared/tools-catalog";
import { formatUrlPathBreadcrumbs } from "../../shared/url-breadcrumbs";
import {
  buildCloseTabLine,
  buildNavigateLine,
  buildSwitchTabLine,
  buildWaitLine,
} from "../../shared/tools-hub-templates";
import { delay, ToolHero, toastResult, type ToolsHubBridge } from "./ToolDetailViews";

function useActiveSessionId(bridge: ToolsHubBridge): string {
  const [sid, setSid] = useState(() => bridge.getActiveSessionId?.() || "s_ab12cd");
  useEffect(() => {
    const sync = () => setSid(bridge.getActiveSessionId?.() || "s_ab12cd");
    sync();
    const id = window.setInterval(sync, 250);
    return () => window.clearInterval(id);
  }, [bridge]);
  return sid;
}

function ToolsHubNavigateDemo({ url }: { url: string }): ReactElement {
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  const display = useMemo(() => formatUrlPathBreadcrumbs(url || "https://example.com"), [url]);
  useEffect(() => {
    if (rm) {
      setPhase(3);
      return;
    }
    let c = false;
    (async () => {
      while (!c) {
        setPhase(1);
        await delay(500);
        if (c) break;
        setPhase(2);
        await delay(900);
        if (c) break;
        setPhase(3);
        await delay(1800);
      }
    })();
    return () => {
      c = true;
    };
  }, [url, rm]);
  return (
    <div
      className="tools-hub-flow-demo tools-hub-flow-demo--navigate"
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-flow-chrome tools-hub-flow-chrome--nav">
        <span className="tools-hub-flow-dot" />
        <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
        <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
        <span className="tools-hub-flow-spacer" />
        <span className="tools-hub-flow-loadpill">
          <span className="tools-hub-flow-loadfill" />
        </span>
      </div>
      <div className={"tools-hub-flow-urlbar" + (phase >= 2 ? " tools-hub-flow-urlbar--on" : "")}>
        <span className="tools-hub-flow-url-text">{phase >= 2 ? display : ""}</span>
        {phase >= 2 ? <span className="tools-hub-flow-url-caret" /> : null}
      </div>
      <div className="tools-hub-flow-page tools-hub-flow-page--site">
        <div className={"tools-hub-flow-page-lines" + (phase === 3 ? " tools-hub-flow-page-lines--on" : "")}>
          <span className="tools-hub-flow-line tools-hub-flow-line--w1" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w4" />
        </div>
        {phase >= 3 ? <span className="tools-hub-flow-page-label">Loaded</span> : null}
      </div>
    </div>
  );
}

function ToolsHubHistoryDemo({ dir }: { dir: "back" | "forward" }): ReactElement {
  const [phase, setPhase] = useState(0);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  useEffect(() => {
    if (rm) return;
    let c = false;
    (async () => {
      while (!c) {
        setPhase(0);
        await delay(600);
        if (c) break;
        setPhase(1);
        await delay(1400);
      }
    })();
    return () => {
      c = true;
    };
  }, [dir, rm]);
  return (
    <div
      className={
        "tools-hub-flow-demo tools-hub-flow-demo--history tools-hub-flow-demo--history-" + dir
      }
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-flow-chrome tools-hub-flow-chrome--nav">
        <span className="tools-hub-flow-dot" />
        <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
        <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
        <span className="tools-hub-flow-spacer" />
        <span className={"tools-hub-flow-navhint tools-hub-flow-navhint--" + dir} />
      </div>
      <div className="tools-hub-flow-page tools-hub-flow-page--slide">
        <div className="tools-hub-flow-slide-track">
          <div className="tools-hub-flow-slide-pane" aria-hidden>
            <div className="tools-hub-flow-slide-lines">
              <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w4" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w1" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
            </div>
          </div>
          <div className="tools-hub-flow-slide-pane" aria-hidden>
            <div className="tools-hub-flow-slide-lines">
              <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w4" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w1" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsHubReloadDemo(): ReactElement {
  const [phase, setPhase] = useState(0);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  useEffect(() => {
    if (rm) return;
    let c = false;
    (async () => {
      while (!c) {
        setPhase(0);
        await delay(500);
        if (c) break;
        setPhase(1);
        await delay(1600);
      }
    })();
    return () => {
      c = true;
    };
  }, [rm]);
  return (
    <div
      className="tools-hub-flow-demo tools-hub-flow-demo--reload"
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-flow-chrome tools-hub-flow-chrome--reload">
        <span className="tools-hub-flow-dot" />
        <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
        <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
        <span className="tools-hub-flow-spacer" />
        <svg className="tools-hub-flow-reload-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 3M3 3v6h6M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 21M21 21v-6h-6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="tools-hub-flow-page tools-hub-flow-page--reload">
        <div className="tools-hub-flow-reload-lines" aria-hidden>
          <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w4" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w1" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
        </div>
      </div>
    </div>
  );
}

function ToolsHubSwitchTabDemo(): ReactElement {
  const [phase, setPhase] = useState(0);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  useEffect(() => {
    if (rm) {
      setPhase(1);
      return;
    }
    let c = false;
    (async () => {
      while (!c) {
        setPhase(0);
        await delay(600);
        if (c) break;
        setPhase(1);
        await delay(1400);
      }
    })();
    return () => {
      c = true;
    };
  }, [rm]);
  return (
    <div
      className="tools-hub-flow-demo tools-hub-flow-demo--switch-tab"
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-flow-tabstrip">
        <span className={"tools-hub-flow-tab" + (phase === 0 ? " tools-hub-flow-tab--active" : "")}>
          Docs
          {phase === 0 ? <span className="tools-hub-flow-tab-badge">active</span> : null}
        </span>
        <span
          className={
            "tools-hub-flow-tab tools-hub-flow-tab--target" + (phase === 1 ? " tools-hub-flow-tab--active" : "")
          }
        >
          Tab 24532
          {phase === 1 ? <span className="tools-hub-flow-tab-badge">active</span> : null}
        </span>
      </div>
      <div className="tools-hub-flow-page tools-hub-flow-page--tab" aria-hidden>
        <div
          className={
            "tools-hub-flow-tabcontent tools-hub-flow-tabcontent--a" + (phase === 0 ? " tools-hub-flow-tabcontent--on" : "")
          }
        >
          Docs content
        </div>
        <div
          className={
            "tools-hub-flow-tabcontent tools-hub-flow-tabcontent--b tools-hub-flow-tabcontent--target" +
            (phase === 1 ? " tools-hub-flow-tabcontent--on" : "")
          }
        >
          Tab 24532 content
        </div>
      </div>
    </div>
  );
}

function ToolsHubNewTabDemo(): ReactElement {
  const [phase, setPhase] = useState(0);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  useEffect(() => {
    if (rm) {
      setPhase(1);
      return;
    }
    let c = false;
    (async () => {
      while (!c) {
        setPhase(0);
        await delay(700);
        if (c) break;
        setPhase(1);
        await delay(1600);
      }
    })();
    return () => {
      c = true;
    };
  }, [rm]);
  return (
    <div
      className="tools-hub-flow-demo tools-hub-flow-demo--new-tab"
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-flow-tabstrip tools-hub-flow-tabstrip--new">
        <span className={"tools-hub-flow-tab" + (phase === 0 ? " tools-hub-flow-tab--active" : "")}>
          Home
          {phase === 0 ? <span className="tools-hub-flow-tab-badge">active</span> : null}
        </span>
        <span
          className={
            "tools-hub-flow-tab tools-hub-flow-tab--new" + (phase === 1 ? " tools-hub-flow-tab--active" : "")
          }
        >
          New tab
          {phase === 1 ? <span className="tools-hub-flow-tab-badge">active</span> : null}
        </span>
      </div>
      <div className="tools-hub-flow-page tools-hub-flow-page--blank" aria-hidden>
        <div
          className={
            "tools-hub-flow-tabcontent tools-hub-flow-tabcontent--a" + (phase === 0 ? " tools-hub-flow-tabcontent--on" : "")
          }
        >
          Home content
        </div>
        <div
          className={
            "tools-hub-flow-tabcontent tools-hub-flow-tabcontent--b tools-hub-flow-tabcontent--target" +
            (phase === 1 ? " tools-hub-flow-tabcontent--on" : "")
          }
        >
          New tab blank
        </div>
      </div>
    </div>
  );
}

function ToolsHubCloseTabDemo(): ReactElement {
  const [phase, setPhase] = useState(0);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  useEffect(() => {
    if (rm) {
      setPhase(1);
      return;
    }
    let c = false;
    (async () => {
      while (!c) {
        setPhase(0);
        await delay(700);
        if (c) break;
        setPhase(1);
        await delay(1500);
      }
    })();
    return () => {
      c = true;
    };
  }, [rm]);
  return (
    <div
      className="tools-hub-flow-demo tools-hub-flow-demo--close-tab"
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-flow-tabstrip tools-hub-flow-tabstrip--close">
        <span className={"tools-hub-flow-tab tools-hub-flow-tab--active"}>Docs</span>
        <span
          className={
            "tools-hub-flow-tab tools-hub-flow-tab--close" + (phase === 1 ? " tools-hub-flow-tab--gone" : "")
          }
        >
          Preview
        </span>
      </div>
      <div className="tools-hub-flow-page tools-hub-flow-page--tab" aria-hidden>
        <div
          className={
            "tools-hub-flow-tabcontent tools-hub-flow-tabcontent--a" + (phase === 0 ? " tools-hub-flow-tabcontent--on" : "")
          }
        >
          Docs + preview
        </div>
        <div
          className={
            "tools-hub-flow-tabcontent tools-hub-flow-tabcontent--b" + (phase === 1 ? " tools-hub-flow-tabcontent--on" : "")
          }
        >
          Docs (active)
        </div>
      </div>
    </div>
  );
}

function ToolsHubTabCycleDemo(): ReactElement {
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  useEffect(() => {
    if (rm) {
      setPhase(4);
      return;
    }
    let c = false;
    (async () => {
      while (!c) {
        setPhase(1);
        await delay(700);
        if (c) break;
        setPhase(2);
        await delay(1200);
        if (c) break;
        setPhase(3);
        await delay(1200);
        if (c) break;
        setPhase(4);
        await delay(1200);
      }
    })();
    return () => {
      c = true;
    };
  }, [rm]);

  return (
    <div
      className="tools-hub-flow-demo tools-hub-flow-demo--new-tab"
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-flow-tabstrip tools-hub-flow-tabstrip--new">
        <span
          className={
            "tools-hub-flow-tab" +
            (phase === 4 ? " tools-hub-flow-tab--ghost" : "") +
            (phase === 1 || phase === 3 ? " tools-hub-flow-tab--active" : "")
          }
        >
          <span className="tools-hub-flow-tab-top">
            <span className="tools-hub-flow-tab-favicon" />
            <span className="tools-hub-flow-tab-title">Docs</span>
            {phase === 1 || phase === 3 ? <span className="tools-hub-flow-tab-active-dot" /> : null}
          </span>
        </span>
        <span
          className={
            "tools-hub-flow-tab tools-hub-flow-tab--new" +
            (phase === 2 || phase === 4 ? " tools-hub-flow-tab--active" : "") +
            (phase === 1 ? " tools-hub-flow-tab--ghost" : "")
          }
        >
          <span className="tools-hub-flow-tab-top">
            <span className="tools-hub-flow-tab-favicon" />
            <span className="tools-hub-flow-tab-title">New tab</span>
            {phase === 2 || phase === 4 ? <span className="tools-hub-flow-tab-active-dot" /> : null}
          </span>
        </span>
      </div>
      <div className="tools-hub-flow-page tools-hub-flow-page--blank" aria-hidden>
        <div
          className={
            "tools-hub-flow-tabcontent tools-hub-flow-tabcontent--a" +
            (phase === 1 || phase === 3 ? " tools-hub-flow-tabcontent--on" : "")
          }
        >
          Docs content
        </div>
        <div
          className={
            "tools-hub-flow-tabcontent tools-hub-flow-tabcontent--b tools-hub-flow-tabcontent--target" +
            (phase === 2 || phase === 4 ? " tools-hub-flow-tabcontent--on" : "")
          }
        >
          New tab blank
        </div>
      </div>
    </div>
  );
}

function ToolsHubNavControlsCycleDemo(): ReactElement {
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  useEffect(() => {
    if (rm) {
      setPhase(4);
      return;
    }
    let c = false;
    (async () => {
      while (!c) {
        setPhase(1);
        await delay(1200);
        if (c) break;
        setPhase(2);
        await delay(1200);
        if (c) break;
        setPhase(3);
        await delay(1500);
        if (c) break;
        setPhase(4);
        await delay(900);
      }
    })();
    return () => {
      c = true;
    };
  }, [rm]);

  return (
    <div
      className="tools-hub-flow-demo tools-hub-flow-demo--navcycle"
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-flow-chrome tools-hub-flow-chrome--nav">
        <span className="tools-hub-flow-dot" />
        <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
        <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
        <span className="tools-hub-flow-spacer" />
        <span className="tools-hub-flow-navcycle-hints" aria-hidden>
          <span className="tools-hub-flow-navcycle-hint tools-hub-flow-navhint tools-hub-flow-navhint--back">Back</span>
          <span className="tools-hub-flow-navcycle-hint tools-hub-flow-navhint tools-hub-flow-navhint--forward">
            Forward
          </span>
          <span className="tools-hub-flow-navcycle-hint tools-hub-flow-navcycle-hint--reload">
            <svg
              className="tools-hub-flow-reload-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 3M3 3v6h6M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 21M21 21v-6h-6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Reload
          </span>
        </span>
      </div>

      <div className="tools-hub-flow-page tools-hub-flow-page--slide tools-hub-flow-page--navcycle" aria-hidden>
        <div className="tools-hub-flow-slide-track">
          <div className="tools-hub-flow-slide-pane" aria-hidden>
            <div className="tools-hub-flow-slide-lines">
              <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w4" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w1" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
            </div>
          </div>
          <div className="tools-hub-flow-slide-pane" aria-hidden>
            <div className="tools-hub-flow-slide-lines">
              <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w4" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w1" />
              <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
            </div>
          </div>
        </div>
        <div className="tools-hub-flow-reload-lines tools-hub-flow-reload-lines--overlay" aria-hidden>
          <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w4" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w1" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w3" />
          <span className="tools-hub-flow-line tools-hub-flow-line--w2" />
        </div>
      </div>
    </div>
  );
}

function ToolsHubWaitDemo({ ms, unit }: { ms: number; unit: "ms" | "s" }): ReactElement {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [rm, setRm] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const s = () => setRm(mq.matches);
    mq.addEventListener("change", s);
    return () => mq.removeEventListener("change", s);
  }, []);
  const label = useMemo(() => {
    const n = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : unit === "s" ? 1 : 1000;
    return unit === "s" ? `${n}s` : `${n}ms`;
  }, [ms, unit]);
  useEffect(() => {
    if (rm) {
      setPhase(4);
      return;
    }
    let c = false;
    (async () => {
      while (!c) {
        setPhase(0);
        await delay(900);
        if (c) break;
        setPhase(1);
        await delay(700);
        if (c) break;
        setPhase(2);
        await delay(600);
        if (c) break;
        setPhase(3);
        await delay(950);
        if (c) break;
        setPhase(4);
        await delay(1400);
      }
    })();
    return () => {
      c = true;
    };
  }, [label, ms, unit, rm]);

  const stepWaitingOn = phase === 0;
  const stepInterruptedOn = phase === 1 || phase === 2;
  const stepResumedOn = phase === 3 || phase === 4;

  const userAction = phase === 2 ? "Clicked" : null;

  return (
    <div
      className="tools-hub-flow-demo tools-hub-flow-demo--wait"
      data-phase={phase}
      data-reduce-motion={rm ? "true" : "false"}
      aria-hidden
    >
      <div className="tools-hub-wait-stepper" aria-hidden>
        <span className={"tools-hub-wait-step" + (stepWaitingOn ? " tools-hub-wait-step--on" : "")}>
          Waiting
        </span>
        <span className={"tools-hub-wait-step" + (stepInterruptedOn ? " tools-hub-wait-step--on" : "")}>
          Interrupted
        </span>
        <span className={"tools-hub-wait-step" + (stepResumedOn ? " tools-hub-wait-step--on" : "")}>
          Resumed
        </span>
      </div>
      <div className="tools-hub-flow-wait">
        <div className="tools-hub-flow-wait-stage">
          <svg className="tools-hub-flow-wait-ring" viewBox="0 0 36 36" aria-hidden>
            <circle className="tools-hub-flow-wait-bg" cx="18" cy="18" r="15.5" />
            <circle className="tools-hub-flow-wait-fg" cx="18" cy="18" r="15.5" />
          </svg>
          <span className="tools-hub-flow-wait-label">{label}</span>

          <div className="tools-hub-flow-wait-overlay" aria-hidden>
            <div className="tools-hub-flow-wait-overlay-card">
              <div className="tools-hub-flow-wait-overlay-title">User took control</div>
              <div className="tools-hub-flow-wait-overlay-sub">
                {userAction ? `User action: ${userAction}` : "Automation paused"}
              </div>
              <div className="tools-hub-flow-wait-overlay-tip">Continue to resume</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToolsHubNavFlowDetail({
  category,
  item,
  bridge,
  onBack,
}: {
  category: ToolsHubCategory;
  item: ToolsHubItem;
  bridge: ToolsHubBridge;
  onBack: () => void;
}): ReactElement {
  const sid = useActiveSessionId(bridge);
  const cmd = item.command;

  const [navUrl, setNavUrl] = useState("https://example.com");
  const navigateLine = useMemo(() => buildNavigateLine(navUrl, sid), [navUrl, sid]);

  const [switchId, setSwitchId] = useState("24532");
  const switchLine = useMemo(() => buildSwitchTabLine(switchId, sid), [switchId, sid]);

  const [closeId, setCloseId] = useState("");
  const closeLine = useMemo(() => buildCloseTabLine(closeId, sid), [closeId, sid]);

  const [waitAmount, setWaitAmount] = useState(1000);
  const [waitUnit, setWaitUnit] = useState<"ms" | "s">("ms");
  const waitLine = useMemo(() => buildWaitLine(waitAmount, waitUnit, sid), [sid, waitAmount, waitUnit]);

  const testLine = useCallback(
    (line: string) => async () => {
      try {
        bridge.closeToolsHub?.();
        await delay(60);
        const r = await bridge.dispatchAutomationLine?.(line);
        toastResult(bridge, r, line);
      } catch (e) {
        bridge.showToast?.(e instanceof Error ? e.message : "Command failed", 4000);
      }
    },
    [bridge],
  );

  if (cmd === "tab") {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [cmdPick, setCmdPick] = useState<"newTab" | "switchTab" | "closeTab">("newTab");
    useEffect(() => {
      let cancelled = false;
      (async () => {
        while (!cancelled) {
          setStep(1);
          await delay(700);
          if (cancelled) break;
          setStep(2);
          await delay(1200);
          if (cancelled) break;
          setStep(3);
          await delay(1200);
          if (cancelled) break;
          setStep(4);
          await delay(1200);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []);
    const displayLine =
      cmdPick === "newTab"
        ? `new tab in session ${sid}`
        : cmdPick === "switchTab"
          ? `switch tab {TabId} in session ${sid}`
          : `close tab in session ${sid}`;
    const runLine =
      cmdPick === "newTab"
        ? `new tab in session ${sid}`
        : cmdPick === "switchTab"
          ? `switch tab 24532 in session ${sid}`
          : `close tab in session ${sid}`;
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-tabc-demo">
          <h3 id="tools-hub-tabc-demo" className="tools-hub-tool-h3">
            What it does
          </h3>
          <p className="tools-hub-tool-lead">
            Shows a full tab lifecycle: create a new tab, switch back, then close the created tab—ending where you started.
          </p>
          <ol className="tools-hub-fill-story-steps" aria-hidden>
            <li className={step >= 1 ? "tools-hub-fill-story-step--on" : ""}>New tab</li>
            <li className={step >= 2 ? "tools-hub-fill-story-step--on" : ""}>Switch tab</li>
            <li className={step >= 3 ? "tools-hub-fill-story-step--on" : ""}>Close tab</li>
            <li className={step >= 4 ? "tools-hub-fill-story-step--on" : ""}>Back to single tab</li>
          </ol>
          <ToolsHubTabCycleDemo />
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-tabc-cmd">
          <h3 id="tools-hub-tabc-cmd" className="tools-hub-tool-h3">
            Command format
          </h3>
          <p className="tools-hub-tool-hint">These are the three commands this tool groups together.</p>
          <div className="tools-hub-dir-toggle" role="group" aria-label="Tab command">
            <button
              type="button"
              className={"tools-hub-dir-btn" + (cmdPick === "newTab" ? " tools-hub-dir-btn--active" : "")}
              onClick={() => setCmdPick("newTab")}
            >
              New tab
            </button>
            <button
              type="button"
              className={"tools-hub-dir-btn" + (cmdPick === "switchTab" ? " tools-hub-dir-btn--active" : "")}
              onClick={() => setCmdPick("switchTab")}
            >
              Switch tab
            </button>
            <button
              type="button"
              className={"tools-hub-dir-btn" + (cmdPick === "closeTab" ? " tools-hub-dir-btn--active" : "")}
              onClick={() => setCmdPick("closeTab")}
            >
              Close tab
            </button>
          </div>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {displayLine}
          </pre>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(runLine)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "nav") {
    const [cmdPick, setCmdPick] = useState<"back" | "forward" | "reload">("back");
    const line = `nav ${cmdPick} in session ${sid}`;
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    useEffect(() => {
      let cancelled = false;
      (async () => {
        while (!cancelled) {
          setStep(1);
          await delay(1200);
          if (cancelled) break;
          setStep(2);
          await delay(1200);
          if (cancelled) break;
          setStep(3);
          await delay(1500);
          if (cancelled) break;
          setStep(4);
          await delay(900);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []);
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />

        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-navc-demo">
          <h3 id="tools-hub-navc-demo" className="tools-hub-tool-h3">
            What it does
          </h3>
          <p className="tools-hub-tool-lead">
            Controls navigation for the active tab: go back, go forward, or reload (same as browser controls).
          </p>
          <ol className="tools-hub-fill-story-steps" aria-hidden>
            <li className={step >= 1 ? "tools-hub-fill-story-step--on" : ""}>Back</li>
            <li className={step >= 2 ? "tools-hub-fill-story-step--on" : ""}>Forward</li>
            <li className={step >= 3 ? "tools-hub-fill-story-step--on" : ""}>Reload</li>
            <li className={step >= 4 ? "tools-hub-fill-story-step--on" : ""}>Ready</li>
          </ol>
          <ToolsHubNavControlsCycleDemo />
        </section>

        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-navc-cmd">
          <h3 id="tools-hub-navc-cmd" className="tools-hub-tool-h3">
            Command format
          </h3>
          <p className="tools-hub-tool-hint">Pick an action to test; the command updates.</p>
          <div className="tools-hub-dir-toggle" role="group" aria-label="Nav control">
            <button
              type="button"
              className={"tools-hub-dir-btn" + (cmdPick === "back" ? " tools-hub-dir-btn--active" : "")}
              onClick={() => setCmdPick("back")}
            >
              Back
            </button>
            <button
              type="button"
              className={"tools-hub-dir-btn" + (cmdPick === "forward" ? " tools-hub-dir-btn--active" : "")}
              onClick={() => setCmdPick("forward")}
            >
              Forward
            </button>
            <button
              type="button"
              className={"tools-hub-dir-btn" + (cmdPick === "reload" ? " tools-hub-dir-btn--active" : "")}
              onClick={() => setCmdPick("reload")}
            >
              Reload
            </button>
          </div>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {line}
          </pre>
        </section>

        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(line)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "navigate") {
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-nav-demo">
          <h3 id="tools-hub-nav-demo" className="tools-hub-tool-h3">
            What it does
          </h3>
          <p className="tools-hub-tool-lead">
            Sends a navigation command so the active tab loads the URL you specify (same as natural-language{" "}
            <code>go to</code> / <code>open</code>).
          </p>
          <ToolsHubNavigateDemo url={navUrl} />
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-nav-try">
          <h3 id="tools-hub-nav-try" className="tools-hub-tool-h3">
            Try it
          </h3>
          <p className="tools-hub-tool-hint">Edit the URL; the command line updates.</p>
          <div className="tools-hub-fill-fields">
            <label className="tools-hub-fill-field">
              <span className="tools-hub-fill-field-label">URL</span>
              <input
                className="tools-hub-fill-input-editable"
                value={navUrl}
                onChange={(e) => setNavUrl(e.target.value)}
                placeholder="https://…"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-nav-cmd">
          <h3 id="tools-hub-nav-cmd" className="tools-hub-tool-h3">
            Command format
          </h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {navigateLine}
          </pre>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(navigateLine)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "back") {
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">What it does</h3>
          <p className="tools-hub-tool-lead">
            Moves the active tab one step backward in history (same as the browser Back control).
          </p>
          <ToolsHubHistoryDemo dir="back" />
        </section>
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">Command format</h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {`back in session ${sid}`}
          </pre>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(`back in session ${sid}`)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "forward") {
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">What it does</h3>
          <p className="tools-hub-tool-lead">
            Moves the active tab one step forward in history (same as the browser Forward control).
          </p>
          <ToolsHubHistoryDemo dir="forward" />
        </section>
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">Command format</h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {`forward in session ${sid}`}
          </pre>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(`forward in session ${sid}`)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "reload") {
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">What it does</h3>
          <p className="tools-hub-tool-lead">Reloads the current page in the active tab.</p>
          <ToolsHubReloadDemo />
        </section>
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">Command format</h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {`reload in session ${sid}`}
          </pre>
          <p className="tools-hub-tool-output-hint">
            Alias: <code>refresh</code>
          </p>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(`reload in session ${sid}`)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "switchTab") {
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-sw-demo">
          <h3 id="tools-hub-sw-demo" className="tools-hub-tool-h3">
            What it does
          </h3>
          <p className="tools-hub-tool-lead">
            Activates the tab whose 5-digit TabId matches (from <code>list tabs</code>).
          </p>
          <ToolsHubSwitchTabDemo />
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-sw-try">
          <h3 id="tools-hub-sw-try" className="tools-hub-tool-h3">
            Try it
          </h3>
          <p className="tools-hub-tool-hint">Enter a 5-digit TabId (digits only; shorter values are padded).</p>
          <div className="tools-hub-fill-fields">
            <label className="tools-hub-fill-field">
              <span className="tools-hub-fill-field-label">TabId</span>
              <input
                className="tools-hub-fill-input-editable"
                value={switchId}
                onChange={(e) => setSwitchId(e.target.value)}
                placeholder="24532"
                inputMode="numeric"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-sw-cmd">
          <h3 id="tools-hub-sw-cmd" className="tools-hub-tool-h3">
            Command format
          </h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {switchLine}
          </pre>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(switchLine)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "newTab") {
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">What it does</h3>
          <p className="tools-hub-tool-lead">Opens a new empty tab and focuses it.</p>
          <ToolsHubNewTabDemo />
        </section>
        <section className="tools-hub-tool-section">
          <h3 className="tools-hub-tool-h3">Command format</h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {`new tab in session ${sid}`}
          </pre>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(`new tab in session ${sid}`)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "closeTab") {
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-close-demo">
          <h3 id="tools-hub-close-demo" className="tools-hub-tool-h3">
            What it does
          </h3>
          <p className="tools-hub-tool-lead">
            Closes the current tab, or a specific tab when you pass a 5-digit TabId.
          </p>
          <ToolsHubCloseTabDemo />
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-close-try">
          <h3 id="tools-hub-close-try" className="tools-hub-tool-h3">
            Try it
          </h3>
          <p className="tools-hub-tool-hint">
            Leave empty for <code>close tab</code> (current), or enter a TabId.
          </p>
          <div className="tools-hub-fill-fields">
            <label className="tools-hub-fill-field">
              <span className="tools-hub-fill-field-label">TabId (optional)</span>
              <input
                className="tools-hub-fill-input-editable"
                value={closeId}
                onChange={(e) => setCloseId(e.target.value)}
                placeholder="24532"
                inputMode="numeric"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-close-cmd">
          <h3 id="tools-hub-close-cmd" className="tools-hub-tool-h3">
            Command format
          </h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {closeLine}
          </pre>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(closeLine)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  if (cmd === "wait") {
    return (
      <div className="tools-hub-inner tools-hub-inner--tool">
        <ToolHero category={category} item={item} onBack={onBack} />
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-wait-demo">
          <h3 id="tools-hub-wait-demo" className="tools-hub-tool-h3">
            What it does
          </h3>
          <p className="tools-hub-tool-lead">Pauses automation for the given duration before the next command runs.</p>
          <ToolsHubWaitDemo ms={waitAmount} unit={waitUnit} />
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-wait-try">
          <h3 id="tools-hub-wait-try" className="tools-hub-tool-h3">
            Try it
          </h3>
          <p className="tools-hub-tool-hint">Amount and unit (ms or seconds).</p>
          <div className="tools-hub-fill-fields tools-hub-flow-wait-fields">
            <label className="tools-hub-fill-field">
              <span className="tools-hub-fill-field-label">Duration</span>
              <input
                className="tools-hub-fill-input-editable"
                type="number"
                min={1}
                value={waitAmount}
                onChange={(e) => setWaitAmount(Number(e.target.value) || 1)}
              />
            </label>
            <div className="tools-hub-dir-toggle" role="group" aria-label="Wait unit">
              <button
                type="button"
                className={"tools-hub-dir-btn" + (waitUnit === "ms" ? " tools-hub-dir-btn--active" : "")}
                onClick={() => setWaitUnit("ms")}
              >
                Milliseconds
              </button>
              <button
                type="button"
                className={"tools-hub-dir-btn" + (waitUnit === "s" ? " tools-hub-dir-btn--active" : "")}
                onClick={() => setWaitUnit("s")}
              >
                Seconds
              </button>
            </div>
          </div>
        </section>
        <section className="tools-hub-tool-section" aria-labelledby="tools-hub-wait-cmd">
          <h3 id="tools-hub-wait-cmd" className="tools-hub-tool-h3">
            Command format
          </h3>
          <pre className="tools-hub-tool-pre" tabIndex={0}>
            {waitLine}
          </pre>
        </section>
        <div className="tools-hub-tool-actions">
          <button type="button" className="tools-hub-test-btn" onClick={() => void testLine(waitLine)()}>
            Test now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />
      <p className="tools-hub-tool-desc">Unknown tool.</p>
    </div>
  );
}
