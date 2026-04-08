/**
 * Stream OpenAI-compatible POST /chat/completions from main (no renderer CORS).
 */

import type { WebContents } from "electron";
import { httpsRequestStream, readErrorBody } from "./ai-custom-tls";

const activeCancels = new Map<string, () => void>();

/** Called from IPC when the renderer stops generation (AbortSignal). */
export function cancelAiChatProxyByChannel(channel: string): void {
  const fn = activeCancels.get(channel);
  if (fn) {
    activeCancels.delete(channel);
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export async function proxyOpenAiChatCompletionsStream(
  sender: WebContents,
  channel: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  tlsCaPem?: string,
): Promise<void> {
  try {
    const session = await httpsRequestStream(url, "POST", headers, body, tlsCaPem);
    activeCancels.set(channel, session.cancel);
    const res = session.response;
    const status = res.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      const t = await readErrorBody(res);
      sender.send(channel, {
        error: t || `HTTP ${status}`,
        httpStatus: status,
      });
      return;
    }
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      if (chunk.length) sender.send(channel, { chunk });
    });
    await new Promise<void>((resolve, reject) => {
      res.on("end", () => resolve());
      res.on("error", reject);
    });
    sender.send(channel, { done: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sender.send(channel, { error: msg });
  } finally {
    activeCancels.delete(channel);
  }
}
