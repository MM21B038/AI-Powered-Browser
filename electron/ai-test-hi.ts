/**
 * Smoke-test AI chat from main process (no renderer CORS).
 */

function normalizeOpenAiBase(base: string): string {
  const t = base.trim().replace(/\/+$/, "");
  return t.endsWith("/v1") ? t.slice(0, -3) : t;
}

export async function testGoogleHiMain(apiKey: string, modelId: string): Promise<{ reply: string }> {
  const key = apiKey.trim();
  const model = modelId.trim();
  if (!key) throw new Error("API key required");
  if (!model) throw new Error("Model required");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  const data = JSON.parse(text) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const out =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { reply: out.trim() || "(empty response)" };
}

export async function testOpenAiHiMain(
  baseUrl: string,
  apiKey: string,
  modelId: string,
): Promise<{ reply: string }> {
  const key = apiKey.trim();
  const model = modelId.trim();
  if (!key) throw new Error("API key required");
  if (!model) throw new Error("Model required");
  const base = normalizeOpenAiBase(baseUrl || "https://api.openai.com");
  const url = `${base}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 64,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  const data = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
  return { reply: reply || "(empty response)" };
}
