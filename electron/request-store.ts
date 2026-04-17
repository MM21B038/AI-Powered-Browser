import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { CapturedRequestRecord, RequestTemplate } from "../src/shared/ipc-types";

type RequestStoreData = {
  templates: RequestTemplate[];
  captures: CapturedRequestRecord[];
};

function storePath(): string {
  return path.join(os.homedir(), ".autonomous-browser", "data", "request-store.json");
}

async function ensure(): Promise<RequestStoreData> {
  const p = storePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<RequestStoreData>;
    return {
      templates: parsed.templates ?? [],
      captures: parsed.captures ?? [],
    };
  } catch {
    const empty: RequestStoreData = { templates: [], captures: [] };
    await fs.writeFile(p, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function save(data: RequestStoreData): Promise<void> {
  await fs.writeFile(storePath(), JSON.stringify(data, null, 2), "utf8");
}

export async function listTemplates(): Promise<RequestTemplate[]> {
  const d = await ensure();
  return d.templates.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getTemplate(id: string): Promise<RequestTemplate | null> {
  const d = await ensure();
  return d.templates.find((t) => t.id === id) ?? null;
}

export async function upsertTemplate(
  tpl: Omit<RequestTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<RequestTemplate> {
  const d = await ensure();
  const now = Date.now();
  const id = tpl.id && tpl.id.trim() ? tpl.id : `req_${now}`;
  const next: RequestTemplate = {
    id,
    name: tpl.name,
    collection: tpl.collection || "General",
    method: tpl.method,
    url: tpl.url,
    headers: tpl.headers || {},
    query: tpl.query || {},
    body: tpl.body,
    bodyType: tpl.bodyType ?? "none",
    auth: tpl.auth ?? { type: "none" },
    cookieProfile: tpl.cookieProfile,
    createdAt: now,
    updatedAt: now,
  };
  const i = d.templates.findIndex((x) => x.id === id);
  if (i >= 0) {
    next.createdAt = d.templates[i].createdAt;
    d.templates[i] = next;
  } else {
    d.templates.push(next);
  }
  await save(d);
  return next;
}

export async function removeTemplate(id: string): Promise<void> {
  const d = await ensure();
  d.templates = d.templates.filter((t) => t.id !== id);
  await save(d);
}

export async function appendCapture(rec: CapturedRequestRecord): Promise<void> {
  const d = await ensure();
  d.captures.unshift(rec);
  d.captures = d.captures.slice(0, 2000);
  await save(d);
}

export async function listCaptures(limit = 100): Promise<CapturedRequestRecord[]> {
  const d = await ensure();
  return d.captures.slice(0, Math.max(1, Math.min(limit, 1000)));
}
