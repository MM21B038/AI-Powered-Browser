/**
 * A2A inbound (Express + JSON-RPC) and outbound (ClientFactory) helpers for the main process.
 */

import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { BrowserWindow } from "electron";
import { app } from "electron";
import type { A2aInboundIpcState } from "../../src/shared/ipc-types";
import express, { type Request, type Response, type NextFunction } from "express";
import { AGENT_CARD_PATH, type AgentCard, type Message } from "@a2a-js/sdk";
import { ClientFactory } from "@a2a-js/sdk/client";
import {
  type AgentExecutor,
  DefaultRequestHandler,
  InMemoryTaskStore,
  RequestContext,
  type ExecutionEventBus,
} from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";

export type A2aInboundConfig = {
  enabled: boolean;
  port: number;
  /** When set, require `Authorization: Bearer <token>` for JSON-RPC (agent card stays public). */
  token: string;
};

const DEFAULT_PORT = 18765;

const inboundPending = new Map<
  string,
  { resolve: (text: string) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }
>();

let httpServer: Server | null = null;
/** Last successful listen URL (set when server is up). */
let lastInboundPublicUrl: string | null = null;
let inboundConfig: A2aInboundConfig = {
  enabled: false,
  port: DEFAULT_PORT,
  token: "",
};

export function getA2aInboundConfig(): A2aInboundConfig {
  return { ...inboundConfig };
}

export function setA2aInboundConfig(next: Partial<A2aInboundConfig>): void {
  inboundConfig = {
    ...inboundConfig,
    ...next,
    port:
      typeof next.port === "number" && next.port > 0 && next.port < 65536
        ? Math.floor(next.port)
        : inboundConfig.port,
    token: typeof next.token === "string" ? next.token : inboundConfig.token,
  };
}

function extractUserPrompt(message: Message): string {
  const parts = message.parts ?? [];
  const texts: string[] = [];
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    const o = p as { kind?: string; text?: string };
    if (o.kind === "text" && typeof o.text === "string") texts.push(o.text);
  }
  return texts.join("\n").trim();
}

function getPrimaryWindow(getWindow: () => BrowserWindow | null): BrowserWindow | null {
  const w = getWindow();
  return w && !w.isDestroyed() ? w : null;
}

export function resolveA2aInboundRequest(
  id: string,
  result: { ok: true; text: string } | { ok: false; error: string },
): void {
  const p = inboundPending.get(id);
  if (!p) return;
  clearTimeout(p.timeout);
  inboundPending.delete(id);
  if (result.ok) p.resolve(result.text);
  else p.reject(new Error(result.error));
}

function createExecutor(getWindow: () => BrowserWindow | null): AgentExecutor {
  return {
    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
      const prompt = extractUserPrompt(requestContext.userMessage);
      const id = crypto.randomUUID();
      const win = getPrimaryWindow(getWindow);

      if (!prompt) {
        const empty: Message = {
          kind: "message",
          messageId: crypto.randomUUID(),
          role: "agent",
          parts: [{ kind: "text", text: "(empty prompt)" }],
          contextId: requestContext.contextId,
        };
        eventBus.publish(empty);
        eventBus.finished();
        return;
      }

      if (!win) {
        const err: Message = {
          kind: "message",
          messageId: crypto.randomUUID(),
          role: "agent",
          parts: [
            {
              kind: "text",
              text: "Autonomous Browser has no active window to run the in-app agent.",
            },
          ],
          contextId: requestContext.contextId,
        };
        eventBus.publish(err);
        eventBus.finished();
        return;
      }

      const promise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!inboundPending.has(id)) return;
          inboundPending.delete(id);
          reject(new Error("Inbound A2A request timed out (120s)."));
        }, 120_000);
        inboundPending.set(id, {
          resolve: (text) => {
            clearTimeout(timeout);
            inboundPending.delete(id);
            resolve(text);
          },
          reject: (e) => {
            clearTimeout(timeout);
            inboundPending.delete(id);
            reject(e);
          },
          timeout,
        });
        win.webContents.send("a2a-inbound-request", { id, prompt });
      });

      try {
        const text = await promise;
        const responseMessage: Message = {
          kind: "message",
          messageId: crypto.randomUUID(),
          role: "agent",
          parts: [{ kind: "text", text }],
          contextId: requestContext.contextId,
        };
        eventBus.publish(responseMessage);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const responseMessage: Message = {
          kind: "message",
          messageId: crypto.randomUUID(),
          role: "agent",
          parts: [{ kind: "text", text: `Error: ${msg}` }],
          contextId: requestContext.contextId,
        };
        eventBus.publish(responseMessage);
      } finally {
        eventBus.finished();
      }
    },
    cancelTask: async (taskId: string, eventBus: ExecutionEventBus): Promise<void> => {
      void taskId;
      eventBus.finished();
    },
  };
}

function buildAgentCard(port: number): AgentCard {
  const base = `http://127.0.0.1:${port}`;
  return {
    name: "Autonomous Browser",
    description:
      "In-app AI assistant with browser automation and MCP tools (A2A inbound; delegates to the Intelligent workspace chat pipeline).",
    protocolVersion: "0.3.0",
    version: "1.0.0",
    url: `${base}/a2a/jsonrpc`,
    skills: [
      {
        id: "chat",
        name: "Chat",
        description: "Run a prompt through the embedded agent",
        tags: ["chat", "browser"],
      },
    ],
    capabilities: {
      pushNotifications: false,
    },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    additionalInterfaces: [{ url: `${base}/a2a/jsonrpc`, transport: "JSONRPC" }],
  };
}

export async function startA2aInboundServer(
  getWindow: () => BrowserWindow | null,
  config: A2aInboundConfig,
): Promise<{ ok: true; port: number; url: string } | { ok: false; error: string }> {
  await stopA2aInboundServer();
  if (!config.enabled) {
    return { ok: true, port: config.port, url: "" };
  }

  const agentCard = buildAgentCard(config.port);
  const executor = createExecutor(getWindow);
  const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), executor);

  const app = express();
  app.use(
    express.json({
      limit: "20mb",
    }),
  );

  const token = config.token.trim();
  if (token.length > 0) {
    app.use("/a2a/jsonrpc", (req: Request, res: Response, next: NextFunction) => {
      const auth = req.headers.authorization?.trim() ?? "";
      const expected = `Bearer ${token}`;
      if (auth !== expected) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });
  }

  app.use(
    `/${AGENT_CARD_PATH}`,
    agentCardHandler({ agentCardProvider: requestHandler }),
  );
  app.use(
    "/a2a/jsonrpc",
    jsonRpcHandler({
      requestHandler,
      userBuilder: UserBuilder.noAuthentication,
    }),
  );

  return await new Promise((resolve) => {
    let settled = false;
    const srv = app.listen(config.port, "127.0.0.1", () => {
      if (settled) return;
      settled = true;
      httpServer = srv;
      const addr = srv.address();
      const port =
        typeof addr === "object" && addr && "port" in addr ? (addr as { port: number }).port : config.port;
      const url = `http://127.0.0.1:${port}`;
      lastInboundPublicUrl = url;
      resolve({
        ok: true,
        port,
        url,
      });
    });
    srv.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        error: err?.message ?? String(err),
      });
    });
  });
}

export async function stopA2aInboundServer(): Promise<void> {
  if (!httpServer) return;
  await new Promise<void>((resolve) => {
    httpServer!.close(() => resolve());
  });
  httpServer = null;
  lastInboundPublicUrl = null;
}

export function getA2aInboundIpcStatePayload(): A2aInboundIpcState {
  return {
    enabled: inboundConfig.enabled,
    port: inboundConfig.port,
    token: inboundConfig.token,
    listeningUrl: httpServer ? lastInboundPublicUrl : null,
  };
}

const A2A_CONFIG_FILE = "a2a-inbound.json";

function a2aConfigPath(): string {
  try {
    return path.join(app.getPath("userData"), A2A_CONFIG_FILE);
  } catch {
    return path.join(process.cwd(), A2A_CONFIG_FILE);
  }
}

export function loadA2aInboundConfigFromDisk(): void {
  try {
    const p = a2aConfigPath();
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw) as Partial<A2aInboundConfig>;
    if (j && typeof j === "object") {
      setA2aInboundConfig({
        enabled: Boolean(j.enabled),
        port: typeof j.port === "number" ? j.port : DEFAULT_PORT,
        token: typeof j.token === "string" ? j.token : "",
      });
    }
  } catch {
    /* ignore */
  }
}

export function saveA2aInboundConfigToDisk(config: A2aInboundConfig): void {
  try {
    fs.writeFileSync(a2aConfigPath(), JSON.stringify(config, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

export async function applyA2aInboundConfig(
  getWindow: () => BrowserWindow | null,
  config: A2aInboundConfig,
): Promise<{ ok: true; port: number; url: string; error?: string } | { ok: false; error: string }> {
  setA2aInboundConfig(config);
  saveA2aInboundConfigToDisk(inboundConfig);
  const started = await startA2aInboundServer(getWindow, inboundConfig);
  if (!started.ok) {
    return { ok: false, error: started.error };
  }
  return {
    ok: true,
    port: started.port,
    url: started.url,
  };
}

function fetchWithExtraHeaders(headers?: Record<string, string>): typeof fetch {
  const impl = (input: string | URL, init?: RequestInit): ReturnType<typeof fetch> => {
    const h = new Headers(init?.headers ?? undefined);
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (v != null && v !== "") h.set(k, v);
      }
    }
    return fetch(input, { ...init, headers: h });
  };
  return impl as typeof fetch;
}

export async function a2aFetchAgentCardMain(
  baseUrl: string,
  agentCardPath?: string,
  headers?: Record<string, string>,
): Promise<{ ok: true; card: AgentCard } | { ok: false; error: string }> {
  try {
    const factory = new ClientFactory({
      clientConfig: { fetchImpl: fetchWithExtraHeaders(headers) },
    } as unknown as ConstructorParameters<typeof ClientFactory>[0]);
    const client = await factory.createFromUrl(baseUrl, agentCardPath);
    const c = await client.getAgentCard();
    return { ok: true, card: c };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function a2aSendMessageMain(payload: {
  baseUrl: string;
  agentCardPath?: string;
  headers?: Record<string, string>;
  text: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const factory = new ClientFactory({
      clientConfig: { fetchImpl: fetchWithExtraHeaders(payload.headers) },
    } as unknown as ConstructorParameters<typeof ClientFactory>[0]);
    const client = await factory.createFromUrl(payload.baseUrl, payload.agentCardPath);
    const sendParams = {
      message: {
        kind: "message" as const,
        messageId: crypto.randomUUID(),
        role: "user" as const,
        parts: [{ kind: "text" as const, text: payload.text }],
      },
    };
    const response = await client.sendMessage(sendParams);
    if (response.kind === "message") {
      const parts = response.parts ?? [];
      const texts: string[] = [];
      for (const p of parts) {
        if (p && typeof p === "object" && "kind" in p && (p as { kind?: string }).kind === "text") {
          texts.push(String((p as { text?: string }).text ?? ""));
        }
      }
      return { ok: true, text: texts.join("\n").trim() || JSON.stringify(response) };
    }
    if (response.kind === "task") {
      return { ok: true, text: JSON.stringify(response.status ?? response) };
    }
    return { ok: true, text: JSON.stringify(response) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
