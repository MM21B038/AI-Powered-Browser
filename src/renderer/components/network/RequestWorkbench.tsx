import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { RequestTemplate } from "../../../shared/ipc-types";
import { getElectronApi } from "../../services/electron-api";
import { useUiStore } from "../../state/ui-store";

const methods: RequestTemplate["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function toPairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((line) => {
      const i = line.indexOf(":");
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
  return out;
}

function fromPairs(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function WorkbenchSection({
  title,
  summary,
  defaultOpen,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <details className="rw-section" open={defaultOpen}>
      <summary className="rw-section-summary">
        <span className="rw-section-title">{title}</span>
        {summary ? <span className="rw-section-hint">{summary}</span> : null}
      </summary>
      <div className="rw-section-body">{children}</div>
    </details>
  );
}

export function RequestWorkbench(): ReactElement | null {
  const api = getElectronApi();
  const open = useUiStore((s) => s.requestWorkbenchOpen);
  const setOpen = useUiStore((s) => s.setRequestWorkbenchOpen);

  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [captures, setCaptures] = useState<string[]>([]);
  const [name, setName] = useState("New request");
  const [collection, setCollection] = useState("General");
  const [method, setMethod] = useState<RequestTemplate["method"]>("GET");
  const [url, setUrl] = useState("https://httpbin.org/get");
  const [headersText, setHeadersText] = useState("Accept: application/json");
  const [body, setBody] = useState("");
  const [cookieProfile, setCookieProfile] = useState("default");
  const [responsePreview, setResponsePreview] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const currentTemplate = useMemo(
    () => templates.find((t) => t.id === activeId) ?? null,
    [templates, activeId],
  );

  useEffect(() => {
    if (!open || !api) return;
    void api.requestListTemplates().then(setTemplates);
    void api.requestListCaptures(20).then((rows) => {
      setCaptures(rows.map((r) => `${r.method} ${r.statusCode} ${r.url}`));
    });
  }, [open, api]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, setOpen]);

  const loadTemplate = (tpl: RequestTemplate) => {
    setActiveId(tpl.id);
    setName(tpl.name);
    setCollection(tpl.collection);
    setMethod(tpl.method);
    setUrl(tpl.url);
    setHeadersText(fromPairs(tpl.headers));
    setBody(tpl.body ?? "");
    setCookieProfile(tpl.cookieProfile ?? "default");
  };

  const saveTemplate = async () => {
    if (!api) return;
    const saved = await api.requestSaveTemplate({
      id: activeId ?? undefined,
      name,
      collection,
      method,
      url,
      headers: toPairs(headersText),
      body,
      bodyType: body ? "text" : "none",
      cookieProfile,
      query: {},
      auth: { type: "none" },
    });
    setActiveId(saved.id);
    setTemplates(await api.requestListTemplates());
  };

  const runNow = async () => {
    if (!api) return;
    const result = await api.requestRun({
      template: {
        id: activeId ?? "adhoc",
        name,
        collection,
        method,
        url,
        headers: toPairs(headersText),
        body,
        bodyType: body ? "text" : "none",
        cookieProfile,
        query: {},
        auth: { type: "none" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      allowMutating: false,
    });
    setResponsePreview(
      `${result.status} ${result.statusText} (${result.durationMs}ms)\n\n${result.bodyPreview}`,
    );
  };

  const runViewportMarkdown = async () => {
    const r = await window.legacyBrowser?.runAutomationCommand?.({
      kind: "info",
      op: "get_viewport_md",
    });
    if (r?.message) setResponsePreview(r.message);
  };

  if (!open) return null;

  const panel = (
    <>
      <div
        className="request-workbench-backdrop"
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <aside
        className="request-workbench-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rw-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="request-workbench-header">
          <div className="request-workbench-header-text">
            <h2 id="rw-dialog-title" className="request-workbench-title">
              Request workbench
            </h2>
            <p className="request-workbench-subtitle">HTTP templates, replay, and capture</p>
          </div>
          <button
            type="button"
            className="request-workbench-close"
            onClick={() => setOpen(false)}
            aria-label="Close request workbench"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path
                d="M4 4L14 14M14 4L4 14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="request-workbench-scroll">
          <WorkbenchSection title="Request" summary="Method, URL, headers, body" defaultOpen>
            <div className="request-row">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
              <input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="Collection" />
            </div>
            <div className="request-row">
              <select value={method} onChange={(e) => setMethod(e.target.value as RequestTemplate["method"])}>
                {methods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <label className="rw-label">Headers</label>
            <textarea value={headersText} onChange={(e) => setHeadersText(e.target.value)} rows={3} />
            <label className="rw-label">Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Optional" />
            <div className="request-row">
              <input
                value={cookieProfile}
                onChange={(e) => setCookieProfile(e.target.value)}
                placeholder="Cookie profile"
              />
            </div>
            <div className="rw-actions">
              <button type="button" className="rw-btn-primary" onClick={() => void saveTemplate()}>
                Save template
              </button>
              <button type="button" className="rw-btn-primary" onClick={() => void runNow()}>
                Run
              </button>
              <button type="button" className="rw-btn-secondary" onClick={() => void runViewportMarkdown()}>
                Viewport MD
              </button>
            </div>
          </WorkbenchSection>

          <WorkbenchSection title="Saved templates" summary={templates.length ? `${templates.length} saved` : "None yet"}>
            <div className="request-list">
              {templates.length === 0 ? (
                <p className="rw-empty">No saved templates yet.</p>
              ) : (
                templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => loadTemplate(t)}
                    className="request-list-item"
                  >
                    {t.collection} / {t.name}
                  </button>
                ))
              )}
            </div>
            {currentTemplate ? (
              <button
                type="button"
                className="rw-btn-danger"
                onClick={async () => {
                  if (!api) return;
                  await api.requestDeleteTemplate(currentTemplate.id);
                  setActiveId(null);
                  setTemplates(await api.requestListTemplates());
                }}
              >
                Delete selected
              </button>
            ) : null}
          </WorkbenchSection>

          <WorkbenchSection title="Captured requests" summary="Recent captures">
            <div className="request-list">
              {captures.length === 0 ? (
                <p className="rw-empty">No captures yet.</p>
              ) : (
                captures.map((x, i) => (
                  <div key={`${x}-${i}`} className="request-capture-item">
                    {x}
                  </div>
                ))
              )}
            </div>
          </WorkbenchSection>

          <WorkbenchSection title="Response" summary="Last run output" defaultOpen>
            <pre className="request-response-preview">{responsePreview || "Run a request to see output here."}</pre>
          </WorkbenchSection>
        </div>
      </aside>
    </>
  );

  return createPortal(panel, document.body);
}
