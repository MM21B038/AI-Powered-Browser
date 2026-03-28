/**
 * List models and smoke-test chat for Google Gemini and OpenAI-compatible APIs.
 * Model listing uses main-process IPC in Electron (Google blocks renderer CORS).
 */

import type { AiProvider } from "../state/session-settings-store";
import { getElectronApi } from "./electron-api";

export type ListedModel = { id: string; displayName?: string };

function normalizeOpenAiBase(base: string): string {
  const t = base.trim().replace(/\/+$/, "");
  return t.endsWith("/v1") ? t.slice(0, -3) : t;
}

export async function listGoogleModels(apiKey: string): Promise<ListedModel[]> {
  const key = apiKey.trim();
  if (!key) throw new Error("API key required");
  const api = getElectronApi();
  if (api?.aiListGoogleModels) {
    return api.aiListGoogleModels(key);
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  };
  const models = data.models ?? [];
  const out: ListedModel[] = [];
  for (const m of models) {
    const name = m.name ?? "";
    const id = name.startsWith("models/") ? name.slice("models/".length) : name;
    if (!id) continue;
    const methods = m.supportedGenerationMethods ?? [];
    if (methods.length && !methods.includes("generateContent")) continue;
    out.push({ id, displayName: m.displayName || id });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function listOpenAiCompatibleModels(baseUrl: string, apiKey: string): Promise<ListedModel[]> {
  const key = apiKey.trim();
  if (!key) throw new Error("API key required");
  const api = getElectronApi();
  if (api?.aiListOpenAiModels) {
    return api.aiListOpenAiModels(baseUrl || "https://api.openai.com", key);
  }
  const base = normalizeOpenAiBase(baseUrl || "https://api.openai.com");
  const url = `${base}/v1/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  const rows = data.data ?? [];
  return rows
    .map((r) => r.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort()
    .map((id) => ({ id, displayName: id }));
}

export async function testChatHi(
  provider: AiProvider,
  opts: { googleApiKey: string; customBaseUrl: string; customApiKey: string; modelId: string },
): Promise<{ reply: string }> {
  const modelId = opts.modelId.trim();
  if (!modelId) throw new Error("Select a model first");

  const api = getElectronApi();
  if (api?.aiTestChatHi) {
    if (provider === "google") {
      return api.aiTestChatHi({
        provider: "google",
        googleApiKey: opts.googleApiKey.trim(),
        modelId,
      });
    }
    return api.aiTestChatHi({
      provider: "custom",
      customBaseUrl: opts.customBaseUrl || "https://api.openai.com",
      customApiKey: opts.customApiKey.trim(),
      modelId,
    });
  }

  if (provider === "google") {
    const key = opts.googleApiKey.trim();
    if (!key) throw new Error("API key required");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return { reply: text.trim() || "(empty response)" };
  }

  const key = opts.customApiKey.trim();
  if (!key) throw new Error("API key required");
  const base = normalizeOpenAiBase(opts.customBaseUrl || "https://api.openai.com");
  const url = `${base}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 64,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
  return { reply: reply || "(empty response)" };
}
