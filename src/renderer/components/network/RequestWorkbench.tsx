import { useEffect, useLayoutEffect, useMemo, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { CapturedRequestRecord, RequestRunResult, RequestTemplate } from "../../../shared/ipc-types";
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

function hostFromUrl(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
}

function pathFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.pathname + (u.search ? u.search : "");
  } catch {
    return raw;
  }
}

export function RequestWorkbench(): ReactElement | null {
  const api = getElectronApi();
  const open = useUiStore((s) => s.requestWorkbenchOpen);
  const setOpen = useUiStore((s) => s.setRequestWorkbenchOpen);

  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [captures, setCaptures] = useState<CapturedRequestRecord[]>([]);
  const [name, setName] = useState("New request");
  const [collection, setCollection] = useState("General");
  const [method, setMethod] = useState<RequestTemplate["method"]>("GET");
  const [url, setUrl] = useState("https://httpbin.org/get");
  const [headersText, setHeadersText] = useState("Accept: application/json");
  const [body, setBody] = useState("");
  const [cookieProfile, setCookieProfile] = useState("default");
  const [responsePreview, setResponsePreview] = useState("");
  const [lastResult, setLastResult] = useState<RequestRunResult | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"templates" | "captures">("templates");
  const [leftQuery, setLeftQuery] = useState("");

  const currentTemplate = useMemo(
    () => templates.find((t) => t.id === activeId) ?? null,
    [templates, activeId],
  );

  const templatesByCollection = useMemo(() => {
    const q = leftTab === "templates" ? leftQuery.trim().toLowerCase() : "";
    const filtered = q
      ? templates.filter((t) => `${t.collection} ${t.name} ${t.method} ${t.url}`.toLowerCase().includes(q))
      : templates;
    const groups = new Map<string, RequestTemplate[]>();
    filtered.forEach((t) => {
      const key = t.collection || "General";
      const arr = groups.get(key) || [];
      arr.push(t);
      groups.set(key, arr);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [templates, leftQuery, leftTab]);

  const filteredCaptures = useMemo(() => {
    const q = leftTab === "captures" ? leftQuery.trim().toLowerCase() : "";
    if (!q) return captures;
    return captures.filter((c) => `${c.method} ${c.statusCode} ${c.url} ${c.resourceType}`.toLowerCase().includes(q));
  }, [captures, leftQuery, leftTab]);

  useLayoutEffect(() => {
    const wv = document.getElementById("webviewContainer");
    const host = document.getElementById("networkWorkbenchRoot");
    if (wv) wv.toggleAttribute("data-workbench-open", open);
    if (host) {
      host.style.display = open ? "block" : "none";
      host.setAttribute("aria-hidden", open ? "false" : "true");
    }
    window.legacyBrowser?.syncRailAndWebview?.();
  }, [open]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener("react-open-workbench", onOpen as EventListener);
    window.addEventListener("react-close-workbench", onClose as EventListener);
    return () => {
      window.removeEventListener("react-open-workbench", onOpen as EventListener);
      window.removeEventListener("react-close-workbench", onClose as EventListener);
    };
  }, [setOpen]);

  useEffect(() => {
    if (!open || !api) return;
    void api.requestListTemplates().then(setTemplates);
    void api.requestListCaptures(20).then((rows) => {
      setCaptures(rows);
    });
  }, [open, api]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void runNow();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveTemplate();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, setOpen, method, url, headersText, body, cookieProfile, name, collection, activeId]);

  const newDraft = () => {
    setActiveId(null);
    setName("New request");
    setCollection("General");
    setMethod("GET");
    setUrl("https://httpbin.org/get");
    setHeadersText("Accept: application/json");
    setBody("");
    setCookieProfile("default");
    setLastResult(null);
    setResponsePreview("");
  };

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
    setLastResult(result);
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
  const host = document.getElementById("networkWorkbenchRoot");
  if (!host) return null;

  const panel = (
    <>
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
          <div className="request-workbench-toolbar" role="toolbar" aria-label="Workbench actions">
            <button type="button" className="rw-btn-secondary" onClick={newDraft}>
              New
            </button>
            <button type="button" className="rw-btn-primary" onClick={() => void saveTemplate()}>
              Save
            </button>
            <button type="button" className="rw-btn-primary" onClick={() => void runNow()}>
              Run
            </button>
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

        <div className="request-workbench-layout">
          <div className="request-workbench-left">
            <div className="rw-left-tabs" role="tablist" aria-label="Workbench left tabs">
              <button
                type="button"
                className={`rw-left-tab${leftTab === "templates" ? " active" : ""}`}
                onClick={() => setLeftTab("templates")}
              >
                Templates
              </button>
              <button
                type="button"
                className={`rw-left-tab${leftTab === "captures" ? " active" : ""}`}
                onClick={() => setLeftTab("captures")}
              >
                Captures
              </button>
            </div>

            <div className="rw-left-search">
              <input
                value={leftQuery}
                onChange={(e) => setLeftQuery(e.target.value)}
                placeholder={leftTab === "templates" ? "Search templates…" : "Search captures…"}
              />
            </div>

            <div className="rw-left-scroll">
              {leftTab === "templates" ? (
                templates.length === 0 ? (
                  <p className="rw-empty">No saved templates yet.</p>
                ) : (
                  templatesByCollection.map(([coll, rows]) => (
                    <div key={coll} className="rw-group">
                      <div className="rw-group-title">{coll}</div>
                      <div className="rw-list">
                        {rows.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => loadTemplate(t)}
                            className={`rw-list-item${t.id === activeId ? " active" : ""}`}
                          >
                            <span className="rw-li-top">
                              <span className="rw-li-method">{t.method}</span>
                              <span className="rw-li-name">{t.name}</span>
                            </span>
                            <span className="rw-li-sub">{hostFromUrl(t.url)}{pathFromUrl(t.url) ? ` · ${pathFromUrl(t.url)}` : ""}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )
              ) : filteredCaptures.length === 0 ? (
                <p className="rw-empty">No captures yet.</p>
              ) : (
                <div className="rw-list">
                  {filteredCaptures.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="rw-list-item"
                      onClick={() => {
                        setMethod((c.method?.toUpperCase() as RequestTemplate["method"]) || "GET");
                        setUrl(c.url);
                        setActiveId(null);
                        setName(`Capture ${new Date(c.timestamp).toLocaleString()}`);
                        setCollection("Captures");
                      }}
                    >
                      <span className="rw-li-top">
                        <span className="rw-li-method">{c.method}</span>
                        <span className={`rw-li-status${c.statusCode >= 200 && c.statusCode < 400 ? " ok" : " bad"}`}>
                          {c.statusCode}
                        </span>
                        <span className="rw-li-name">{hostFromUrl(c.url)}</span>
                      </span>
                      <span className="rw-li-sub">{pathFromUrl(c.url)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="request-workbench-right">
            <div className="rw-editor">
              <div className="rw-editor-top">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
                <input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="Collection" />
              </div>

              <div className="rw-requestline">
                <select value={method} onChange={(e) => setMethod(e.target.value as RequestTemplate["method"])}>
                  {methods.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
              </div>

              <div className="rw-section-card">
                <div className="rw-section-card-title">Headers</div>
                <textarea value={headersText} onChange={(e) => setHeadersText(e.target.value)} rows={4} />
              </div>

              <div className="rw-section-card">
                <div className="rw-section-card-title">Body</div>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Optional" />
              </div>

              <div className="rw-section-card">
                <div className="rw-section-card-title">Cookie profile</div>
                <div className="rw-row">
                  <input
                    value={cookieProfile}
                    onChange={(e) => setCookieProfile(e.target.value)}
                    placeholder="default"
                  />
                  <button type="button" className="rw-btn-secondary" onClick={() => void runViewportMarkdown()}>
                    Viewport MD
                  </button>
                </div>
              </div>

              {currentTemplate ? (
                <div className="rw-danger-row">
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
                    Delete template
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rw-response">
              <div className="rw-response-head">
                <div className="rw-response-title">Response</div>
                {lastResult ? (
                  <div className="rw-response-meta">
                    <span className={`rw-pill${lastResult.ok ? " ok" : " bad"}`}>
                      {lastResult.status} {lastResult.statusText}
                    </span>
                    <span className="rw-dim">{lastResult.durationMs}ms</span>
                  </div>
                ) : (
                  <span className="rw-dim">Run a request to see output.</span>
                )}
              </div>
              <pre className="request-response-preview">{responsePreview || ""}</pre>
            </div>
          </div>
        </div>
      </aside>
    </>
  );

  return createPortal(panel, host);
}
