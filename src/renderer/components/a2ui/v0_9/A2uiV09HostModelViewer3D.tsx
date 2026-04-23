import { useEffect, useMemo, useRef, useState } from "react";
import { createReactComponent } from "@a2ui/react/v0_9";
import { ModelViewer3DApi } from "./a2ui-v0_9-model-viewer-types";
import { isDynamicLeaf } from "./a2ui-v0_9-chart-data-resolve";

type ArtifactRef = { artifactId: string; mime?: string; name?: string };
type ModelFile = { label?: string; source: unknown };

function isArtifactRef(x: unknown): x is ArtifactRef {
  return !!x && typeof x === "object" && !Array.isArray(x) && typeof (x as any).artifactId === "string";
}

function base64ToBlobUrl(base64: string, mime: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
  return URL.createObjectURL(blob);
}

async function artifactToDataUrl(art: ArtifactRef): Promise<{ url: string; name?: string }> {
  const api = (globalThis as any).electronAPI;
  const read = api?.pythonSandboxReadArtifact as undefined | ((p: { artifactId: string }) => Promise<any>);
  if (!read) throw new Error("pythonSandboxReadArtifact unavailable");
  const r = await read({ artifactId: art.artifactId });
  if (!r?.ok) throw new Error(String(r?.error ?? "readArtifact failed"));
  const mime = String(r.mime ?? art.mime ?? "application/octet-stream");
  const dataBase64 = String(r.dataBase64 ?? "");
  if (!dataBase64) throw new Error("missing artifact data");
  return { url: `data:${mime};base64,${dataBase64}`, name: String(r.name ?? art.name ?? "") || undefined };
}

export const a2uiV09HostModelViewer3D = createReactComponent(ModelViewer3DApi as any, ({ props, context }) => {
  const dc = (context as any)?.dataContext;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [tick, setTick] = useState(0);
  const [modelUrl, setModelUrl] = useState<string>("");
  const [downloadUrls, setDownloadUrls] = useState<Array<{ label: string; href: string; name?: string }>>([]);
  const [error, setError] = useState<string>("");

  const resolved = useMemo(() => {
    void tick;
    const srcRaw = (props as any).source;
    const filesRaw = (props as any).files;
    const src = isDynamicLeaf(srcRaw) ? dc?.resolveDynamicValue?.(srcRaw) : srcRaw;
    const files = isDynamicLeaf(filesRaw) ? dc?.resolveDynamicValue?.(filesRaw) : filesRaw;
    return { src, files };
  }, [dc, props, tick]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Register the <model-viewer> custom element lazily (keeps node/vitest import safe).
    void import("@google/model-viewer");
  }, []);

  useEffect(() => {
    if (!dc) return;
    const leaves: unknown[] = [];
    const srcRaw = (props as any).source;
    const filesRaw = (props as any).files;
    if (isDynamicLeaf(srcRaw)) leaves.push(srcRaw);
    if (isDynamicLeaf(filesRaw)) leaves.push(filesRaw);
    if (leaves.length === 0) return;
    const subs = leaves.map((leaf) => dc.subscribeDynamicValue?.(leaf, () => setTick((t) => t + 1)));
    return () => subs.forEach((s: any) => s?.unsubscribe?.());
  }, [dc, props]);

  useEffect(() => {
    let cancelled = false;
    const cleanup: string[] = [];
    const run = async () => {
      setError("");

      // Resolve main model source.
      const src = resolved.src;
      if (typeof src === "string") {
        setModelUrl(src);
      } else if (isArtifactRef(src)) {
        try {
          const { url } = await artifactToDataUrl(src);
          if (!cancelled) setModelUrl(url);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!cancelled) {
            setModelUrl("");
            setError(msg);
          }
        }
      } else {
        setModelUrl("");
      }

      // Resolve download files.
      const filesRaw = resolved.files;
      const files: ModelFile[] = Array.isArray(filesRaw) ? filesRaw : [];
      const out: Array<{ label: string; href: string; name?: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i] as any;
        const label = String(f?.label ?? `File ${i + 1}`);
        const source = f?.source;
        if (typeof source === "string") {
          out.push({ label, href: source });
          continue;
        }
        if (isArtifactRef(source)) {
          try {
            const api = (globalThis as any).electronAPI;
            const read = api?.pythonSandboxReadArtifact as undefined | ((p: { artifactId: string }) => Promise<any>);
            if (!read) continue;
            const r = await read({ artifactId: source.artifactId });
            if (!r?.ok) continue;
            const mime = String(r.mime ?? source.mime ?? "application/octet-stream");
            const dataBase64 = String(r.dataBase64 ?? "");
            if (!dataBase64) continue;
            const href = base64ToBlobUrl(dataBase64, mime);
            cleanup.push(href);
            out.push({ label, href, name: String(r.name ?? source.name ?? "") || undefined });
          } catch {
            /* skip */
          }
        }
      }
      if (!cancelled) setDownloadUrls(out);
    };
    void run();
    return () => {
      cancelled = true;
      cleanup.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      });
    };
  }, [resolved]);

  const title = typeof (props as any).title === "string" ? (props as any).title : "";
  const heightPx = typeof (props as any).heightPx === "number" ? (props as any).heightPx : 520;
  const autoRotate = (props as any).autoRotate !== false;
  const cameraControls = (props as any).cameraControls !== false;
  const exposure = typeof (props as any).exposure === "number" ? (props as any).exposure : 1.0;
  const environmentImage = typeof (props as any).environmentImage === "string" ? (props as any).environmentImage : undefined;

  return (
    <div
      ref={rootRef}
      style={{
        width: "100%",
        borderRadius: "var(--a2ui-host-radius-lg)",
        border: "1px solid var(--a2ui-host-border-subtle)",
        background: "var(--a2ui-host-surface-2)",
        overflow: "hidden",
      }}
    >
      {title ? (
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--a2ui-host-border-subtle)", color: "var(--text)" }}>
          {title}
        </div>
      ) : null}
      <div style={{ height: heightPx, position: "relative" }}>
        {modelUrl ? (
          // @ts-expect-error model-viewer is a custom element
          <model-viewer
            src={modelUrl}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            {...(autoRotate ? { "auto-rotate": "" } : {})}
            {...(cameraControls ? { "camera-controls": "" } : {})}
            exposure={String(exposure)}
            {...(environmentImage ? { "environment-image": environmentImage } : {})}
          />
        ) : (
          <div style={{ padding: 14, color: "var(--text2)" }}>
            {error ? `Model error: ${error}` : "(missing model source)"}
          </div>
        )}
      </div>
      {downloadUrls.length ? (
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--a2ui-host-border-subtle)", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {downloadUrls.map((f) => (
            <a
              key={f.label}
              href={f.href}
              download={f.name ?? undefined}
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              {f.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
});

