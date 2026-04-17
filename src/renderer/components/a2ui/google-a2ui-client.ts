/**
 * A2A transport for A2UI server messages — same behavior as
 * `google/A2UI` `samples/client/react/shell/src/client.ts`, plus
 * {@link https://a2ui.org/specification/v0.8-a2a-extension/ | A2UI A2A extension}
 * `message.metadata.a2uiClientCapabilities` (catalog ids advertise v0.9 support).
 */

import { Part, SendMessageSuccessResponse, Task } from "@a2a-js/sdk";
import { A2AClient } from "@a2a-js/sdk/client";
import { buildA2uiClientMessageMetadata } from "../../../shared/a2ui-a2a-metadata";
import { getHostSupportedCatalogIds } from "../../../shared/a2ui-host-catalog";

const A2UI_MIME_TYPE = "application/json+a2ui";

/** Re-export for callers that build custom A2A requests. */
export const hostSupportedA2uiCatalogIds = (): readonly string[] =>
  getHostSupportedCatalogIds();

export { buildA2uiClientMessageMetadata } from "../../../shared/a2ui-a2a-metadata";

/** v0.8 A2A extension header (protocol envelope; wire payloads may be v0.9 NDJSON). */
export const A2UI_V08_A2A_EXTENSION = "https://a2ui.org/a2a-extension/a2ui/v0.8";

export class GoogleA2uiClient {
  readonly #serverUrl: string;
  #client: A2AClient | null = null;

  constructor(serverUrl = "") {
    this.#serverUrl = serverUrl;
  }

  async #getClient(): Promise<A2AClient> {
    if (!this.#client) {
      const baseUrl = this.#serverUrl || "http://localhost:10002";
      this.#client = await A2AClient.fromCardUrl(
        `${baseUrl}/.well-known/agent-card.json`,
        {
          fetchImpl: async (url, init) => {
            const headers = new Headers(init?.headers);
            headers.set("X-A2A-Extensions", A2UI_V08_A2A_EXTENSION);
            return fetch(url, { ...init, headers });
          },
        },
      );
    }
    return this.#client;
  }

  async send(
    message: Record<string, unknown> | string,
  ): Promise<unknown[]> {
    const client = await this.#getClient();

    let parts: Part[] = [];

    if (typeof message === "string") {
      try {
        const parsed: unknown = JSON.parse(message);
        if (typeof parsed === "object" && parsed !== null) {
          parts = [
            {
              kind: "data",
              data: parsed as Record<string, unknown>,
              mimeType: A2UI_MIME_TYPE,
            } as Part,
          ];
        } else {
          parts = [{ kind: "text", text: message }];
        }
      } catch {
        parts = [{ kind: "text", text: message }];
      }
    } else {
      parts = [
        {
          kind: "data",
          data: message as unknown as Record<string, unknown>,
          mimeType: A2UI_MIME_TYPE,
        } as Part,
      ];
    }

    const response = await client.sendMessage({
      message: {
        messageId: crypto.randomUUID(),
        role: "user",
        parts,
        kind: "message",
        metadata: buildA2uiClientMessageMetadata(),
      },
    });

    if ("error" in response) {
      throw new Error(response.error.message);
    }

    const result = (response as SendMessageSuccessResponse).result as Task;
    if (result.kind === "task" && result.status.message?.parts) {
      const messages: unknown[] = [];
      for (const part of result.status.message.parts) {
        if (part.kind === "data") {
          messages.push(part.data);
        }
      }
      return messages;
    }

    return [];
  }
}
