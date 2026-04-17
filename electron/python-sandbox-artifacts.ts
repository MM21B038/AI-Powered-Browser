/**
 * Persist Python sandbox binary payloads to userData so tool JSON sent to the LLM
 * stays small (artifactId references instead of inline base64).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { PythonSandboxInner } from "./python-sandbox";

const ARTIFACTS_SUBDIR = "python-sandbox-artifacts";

function artifactsRoot(userData: string): string {
  return path.join(userData, ARTIFACTS_SUBDIR);
}

/** UUID v4 — used as artifact id and path segment (no traversal). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidArtifactId(id: string): boolean {
  return UUID_RE.test(id.trim());
}

type FileMeta = { kind: "file"; name: string };
type ImageMeta = { kind: "image"; name: string; mime: string };
type ArtifactMeta = FileMeta | ImageMeta;

function writeArtifact(root: string, id: string, buf: Buffer, meta: ArtifactMeta): void {
  fs.writeFileSync(path.join(root, `${id}.bin`), buf);
  fs.writeFileSync(path.join(root, `${id}.meta.json`), JSON.stringify(meta), "utf8");
}

/**
 * Write files/images with inline base64 to disk; return a new inner object without
 * large base64 fields (artifactId only).
 */
export function persistPythonSandboxArtifacts(
  inner: PythonSandboxInner,
  userDataRoot: string,
): PythonSandboxInner {
  const root = artifactsRoot(userDataRoot);
  fs.mkdirSync(root, { recursive: true });

  const images = inner.images?.length
    ? inner.images.map((im) => {
        const b64 = im.dataBase64;
        if (!b64 || typeof b64 !== "string") return im;
        const id = randomUUID();
        let buf: Buffer;
        try {
          buf = Buffer.from(b64, "base64");
        } catch {
          return im;
        }
        if (buf.length === 0) return im;
        const mime = im.mime?.trim() || "image/png";
        const meta: ImageMeta = {
          kind: "image",
          name: `plot-${id.slice(0, 8)}`,
          mime,
        };
        writeArtifact(root, id, buf, meta);
        return { mime, artifactId: id };
      })
    : undefined;

  const files = inner.files?.length
    ? inner.files.map((f) => {
        if (f.truncated) return f;
        const b64 = f.dataBase64;
        if (!b64 || typeof b64 !== "string") return f;
        const id = randomUUID();
        let buf: Buffer;
        try {
          buf = Buffer.from(b64, "base64");
        } catch {
          return f;
        }
        const meta: FileMeta = { kind: "file", name: f.name };
        writeArtifact(root, id, buf, meta);
        return { name: f.name, size: f.size, artifactId: id };
      })
    : undefined;

  return {
    ...inner,
    ...(images !== undefined ? { images } : {}),
    ...(files !== undefined ? { files } : {}),
  };
}

export type ReadPythonSandboxArtifactResult =
  | { ok: true; dataBase64: string; mime?: string; name?: string }
  | { ok: false; error: string };

export function readPythonSandboxArtifact(
  artifactId: string,
  userDataRoot: string,
): ReadPythonSandboxArtifactResult {
  const id = artifactId.trim();
  if (!isValidArtifactId(id)) {
    return { ok: false, error: "invalid artifact id" };
  }
  const root = artifactsRoot(userDataRoot);
  const binPath = path.join(root, `${id}.bin`);
  const metaPath = path.join(root, `${id}.meta.json`);
  if (!fs.existsSync(binPath)) {
    return { ok: false, error: "artifact not found" };
  }
  let meta: ArtifactMeta | null = null;
  try {
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as ArtifactMeta;
    }
  } catch {
    meta = null;
  }
  const buf = fs.readFileSync(binPath);
  const dataBase64 = buf.toString("base64");
  if (meta?.kind === "image") {
    return { ok: true, dataBase64, mime: meta.mime, name: meta.name };
  }
  if (meta?.kind === "file") {
    return { ok: true, dataBase64, name: meta.name };
  }
  return { ok: true, dataBase64 };
}
