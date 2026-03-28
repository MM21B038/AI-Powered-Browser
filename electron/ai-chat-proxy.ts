/**
 * Stream OpenAI-compatible POST /chat/completions from main (no renderer CORS).
 */

import type { WebContents } from "electron";

export async function proxyOpenAiChatCompletionsStream(
  sender: WebContents,
  channel: string,
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
    });
    if (!res.ok) {
      const t = await res.text();
      sender.send(channel, {
        error: t || `HTTP ${res.status}`,
        httpStatus: res.status,
      });
      return;
    }
    if (!res.body) {
      sender.send(channel, { error: "No response body" });
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        sender.send(channel, { chunk: dec.decode(value, { stream: true }) });
      }
    }
    sender.send(channel, { done: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sender.send(channel, { error: msg });
  }
}
