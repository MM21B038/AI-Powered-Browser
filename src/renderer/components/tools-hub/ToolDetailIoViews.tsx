import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import type { ToolsHubCategory, ToolsHubItem } from "../../shared/tools-catalog";
import { getToolTemplateLine, toolUsesQuickCommand } from "../../shared/tools-hub-templates";
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

function ioExampleFor(command: string): { title: string; output: string; hint?: ReactElement } {
  switch (command) {
    case "url":
      return {
        title: "Example output",
        output: "https://example.com/products?ref=tools-hub",
      };
    case "title":
      return {
        title: "Example output",
        output: "Example Store — Products",
      };
    case "tabs":
      return {
        title: "Example output",
        output:
          "| TabId | Active | Title | URL |\n" +
          "|---:|:---:|---|---|\n" +
          "| 24532 | ✅ | Example Store — Products | https://example.com/products |\n" +
          "| 15638 |  | Checkout | https://example.com/checkout |\n",
        hint: (
          <p className="tools-hub-tool-output-hint">
            Use the 5-digit <code>TabId</code> with <code>switch tab</code>.
          </p>
        ),
      };
    case "screenshot":
      return {
        title: "Example output",
        output: "Screenshot saved (viewport).",
      };
    case "viewportMd":
      return {
        title: "Example output",
        output:
          "# Example Store\n\n" +
          "- Products\n" +
          "- Pricing\n\n" +
          "## Featured\n\n" +
          "**Starter** — $9 / mo\n",
      };
    case "formSchema":
      return {
        title: "Example output",
        output:
          "{\n" +
          '  "fields": [\n' +
          '    { "name": "email", "label": "Work email", "type": "email", "required": true },\n' +
          '    { "name": "password", "label": "Password", "type": "password", "required": true },\n' +
          '    { "name": "notes", "label": "Notes", "type": "textarea", "required": false }\n' +
          "  ]\n" +
          "}",
      };
    case "interactables":
      return {
        title: "Example output",
        output:
          "| Kind | Label | MCP | How | Chat command |\n" +
          "|---|---|---|---|---|\n" +
          '| select | Country | butcher_select | `{"by":"label","value":"Canada"}…` | `select #country by label Canada…` |\n' +
          '| combobox | Region | butcher_select | `{"by":"path","value":"EU > DE"}…` | `select "Region" by path…` |\n' +
          "| input | Work email | butcher_fill | … | `fill #email with …` |\n" +
          "| button | Submit | butcher_click | iframe: guest ids on line | `click …` |",
        hint: (
          <p className="tools-hub-tool-output-hint">
            Each row includes <code>suggestedMcpTool</code>, <code>toolHint</code>, and <code>suggestedCommand</code> in the markdown table.
          </p>
        ),
      };
    default:
      return {
        title: "Example output",
        output: "—",
      };
  }
}

/** Optional animated preview for read-only “info” commands (reuses tools-hub-simple-demo keyframes). */
function ioSimpleDemoClassFor(command: string): string | null {
  switch (command) {
    case "url":
    case "title":
    case "tabs":
    case "screenshot":
    case "viewportMd":
    case "formSchema":
      return null;
    default:
      return null;
  }
}

export function ToolsHubIoDetail({
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
  const line = useMemo(() => getToolTemplateLine(cmd, sid) || cmd, [cmd, sid]);
  const ex = useMemo(() => ioExampleFor(cmd), [cmd]);
  const simpleDemoClass = useMemo(() => ioSimpleDemoClassFor(cmd), [cmd]);

  const testNow = useCallback(async () => {
    if (toolUsesQuickCommand(cmd)) {
      bridge.runQuickCommand?.(cmd, { closeHub: true });
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
  }, [bridge, cmd, line]);

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">What it does</h3>
        <p className="tools-hub-tool-lead">{item.description}</p>
        {simpleDemoClass ? (
          <div className={`tools-hub-simple-demo ${simpleDemoClass}`} aria-hidden>
            <div className="tools-hub-simple-demo-inner" />
          </div>
        ) : null}
      </section>

      <section className="tools-hub-tool-section">
        <h3 className="tools-hub-tool-h3">Command format</h3>
        <pre className="tools-hub-tool-pre" tabIndex={0}>
          {line}
        </pre>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby="tools-hub-io-result-label">
        <h3 id="tools-hub-io-result-label" className="tools-hub-tool-h3">
          {ex.title}
        </h3>
        <pre className="tools-hub-tool-pre tools-hub-tool-pre--io" tabIndex={0}>
          {ex.output}
        </pre>
        {ex.hint ?? null}
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Test now
        </button>
      </div>
    </div>
  );
}

export function ToolsHubPickerDemoDetail({
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
  const line = useMemo(() => getToolTemplateLine(cmd, sid) || cmd, [cmd, sid]);
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
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        setPhase(1);
        await delay(700);
        if (cancelled) break;
        setPhase(2);
        await delay(1100);
        if (cancelled) break;
        setPhase(3);
        await delay(1100);
        if (cancelled) break;
        setPhase(4);
        await delay(1300);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cmd, rm]);

  const testNow = useCallback(async () => {
    bridge.runQuickCommand?.(cmd, { closeHub: true });
  }, [bridge, cmd]);

  const steps =
    cmd === "elemshot"
      ? ["Start capture", "Aim at element", "Click to capture", "Saved"]
      : cmd === "pickerInteractive"
        ? ["Toggle picker", "Snap to nearest", "Pick + run", "Done"]
        : ["Toggle picker", "Hover highlight", "Copy selector", "Ready"];

  const whatId = `tools-hub-picker-what-${item.id}`;
  const cmdId = `tools-hub-picker-cmd-${item.id}`;

  return (
    <div className="tools-hub-inner tools-hub-inner--tool">
      <ToolHero category={category} item={item} onBack={onBack} />

      <section className="tools-hub-tool-section" aria-labelledby={whatId}>
        <h3 id={whatId} className="tools-hub-tool-h3">
          What it does
        </h3>
        <p className="tools-hub-tool-lead">{item.description}</p>
        <ol className="tools-hub-fill-story-steps tools-hub-picker-steps" aria-hidden>
          <li className={phase >= 1 ? "tools-hub-fill-story-step--on" : ""}>{steps[0]}</li>
          <li className={phase >= 2 ? "tools-hub-fill-story-step--on" : ""}>{steps[1]}</li>
          <li className={phase >= 3 ? "tools-hub-fill-story-step--on" : ""}>{steps[2]}</li>
          <li className={phase >= 4 ? "tools-hub-fill-story-step--on" : ""}>{steps[3]}</li>
        </ol>
        <div
          className="tools-hub-picker-demo"
          data-kind={cmd}
          data-phase={phase}
          data-reduce-motion={rm ? "true" : "false"}
          aria-hidden
        >
          <div className="tools-hub-flow-chrome tools-hub-flow-chrome--nav" aria-hidden>
            <span className="tools-hub-flow-dot" />
            <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
            <span className="tools-hub-flow-dot tools-hub-flow-dot--dim" />
            <span className="tools-hub-flow-spacer" />
            <span className="tools-hub-flow-navhint" aria-hidden>
              {cmd === "elemshot"
                ? phase >= 4
                  ? "Captured"
                  : "Element screenshot"
                : cmd === "pickerInteractive"
                  ? "Interactive picker"
                  : "Element picker"}
            </span>
          </div>
          <div className="tools-hub-picker-demo-page">
            <div className="tools-hub-picker-demo-card tools-hub-picker-demo-card--target">
              <span className="tools-hub-picker-demo-card-title">Button</span>
              <span className="tools-hub-picker-demo-pill">button.primary</span>
            </div>
            <div className="tools-hub-picker-demo-card" />
            <div className="tools-hub-picker-demo-card" />
          </div>
          <div className="tools-hub-picker-demo-overlay">
            <span className="tools-hub-picker-demo-highlight" />
            <span className="tools-hub-picker-demo-crosshair" />
            <span className="tools-hub-picker-demo-captureflash" />
          </div>
        </div>
      </section>

      <section className="tools-hub-tool-section" aria-labelledby={cmdId}>
        <h3 id={cmdId} className="tools-hub-tool-h3">
          Command format
        </h3>
        <pre className="tools-hub-tool-pre" tabIndex={0}>
          {toolUsesQuickCommand(cmd) ? `Quick / Tools: ${cmd}` : line}
        </pre>
        <p className="tools-hub-tool-output-hint">This one is interactive: you pick an element on the page.</p>
      </section>

      <div className="tools-hub-tool-actions">
        <button type="button" className="tools-hub-test-btn" onClick={() => void testNow()}>
          Run (same as Quick)
        </button>
      </div>
    </div>
  );
}

