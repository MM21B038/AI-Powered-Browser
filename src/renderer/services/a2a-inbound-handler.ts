/**
 * Handles inbound A2A tasks from the main-process HTTP server by running a one-shot intelligent chat.
 */

import { appendUserMessage, ensureSystemMessage, runAiChatPipeline } from "./ai-chat";
import { getElectronApi } from "./electron-api";
import { loadIntelligentSettings } from "../state/session-settings-store";

export function registerA2aInboundHandler(): () => void {
  const api = getElectronApi();
  if (!api?.a2aOnInboundRequest || !api.a2aInboundReply) {
    return () => {};
  }
  const bridge = api;
  return bridge.a2aOnInboundRequest((req) => {
    void (async () => {
      const { id, prompt } = req;
      try {
        const settings = loadIntelligentSettings();
        const messages = ensureSystemMessage(appendUserMessage([], prompt), "intelligent");
        let assistant = "";
        await runAiChatPipeline({
          scope: "intelligent",
          settings,
          api: bridge,
          messages,
          onEvent: (ev) => {
            if (ev.type === "assistant_delta") assistant += ev.text;
          },
        });
        bridge.a2aInboundReply({
          id,
          ok: true,
          text: assistant.trim() || "(empty reply)",
        });
      } catch (e) {
        bridge.a2aInboundReply({
          id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  });
}
