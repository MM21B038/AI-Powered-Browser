/**
 * List AI models from main process (no browser CORS).
 */

export type ListedAiModel = { id: string; displayName?: string };

function normalizeOpenAiBase(base: string): string {
  const t = base.trim().replace(/\/+$/, "");
  return t.endsWith("/v1") ? t.slice(0, -3) : t;
}

function googleErrorMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string; status?: string } };
    const m = j.error?.message;
    if (m) return m;
  } catch {
    /* ignore */
  }
  return body.slice(0, 500) || "Request failed";
}

export async function listGoogleModelsMain(apiKey: string): Promise<ListedAiModel[]> {
  const key = apiKey.trim();
  if (!key) throw new Error("API key required");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(googleErrorMessage(text) || `HTTP ${res.status}`);
  }
  const data = JSON.parse(text) as {
    models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  };
  const models = data.models ?? [];
  const out: ListedAiModel[] = [];
  for (const m of models) {
    const name = m.name ?? "";
    const id = name.startsWith("models/") ? name.slice("models/".length) : name;
    if (!id) continue;
    const methods = m.supportedGenerationMethods ?? [];
    if (methods.length > 0 && !methods.includes("generateContent")) continue;
    out.push({ id, displayName: m.displayName || id });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function listOpenAiCompatibleModelsMain(baseUrl: string, apiKey: string): Promise<ListedAiModel[]> {
  const key = apiKey.trim();
  if (!key) throw new Error("API key required");
  const base = normalizeOpenAiBase(baseUrl || "https://api.openai.com");
  const url = `${base}/v1/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 500) || `HTTP ${res.status}`);
  }
  const data = JSON.parse(text) as { data?: Array<{ id?: string }> };
  const rows = data.data ?? [];
  return rows
    .map((r) => r.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort()
    .map((id) => ({ id, displayName: id }));
}
