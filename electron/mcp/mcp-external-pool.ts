/**
 * MCP clients for user-configured servers: stdio subprocess or remote Streamable HTTP / SSE.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  McpRemoteTransport,
  McpServerConfigPayload,
} from "../../src/shared/mcp-external-types";

type PoolTransport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;

type PoolEntry = {
  client: Client;
  transport: PoolTransport;
  starting: Promise<void>;
  signature: string;
};

const pool = new Map<string, PoolEntry>();

function parseArgsJson(s: string): string[] {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function parseEnvJson(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function parseHeadersJson(s: string): Record<string, string> {
  return parseEnvJson(s);
}

function connectionSignature(cfg: McpServerConfigPayload): string {
  if (cfg.serverMode === "remote") {
    return JSON.stringify({
      m: "remote",
      url: (cfg.url || "").trim(),
      headers: cfg.headers || "{}",
      rt: cfg.remoteTransport || "auto",
    });
  }
  return JSON.stringify({
    m: "stdio",
    command: (cfg.command || "").trim(),
    args: cfg.args || "[]",
    env: cfg.env || "{}",
  });
}

function parseRemoteUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("MCP server URL is empty");
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error("Invalid MCP server URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("MCP server URL must use http or https");
  }
  return u;
}

async function safeCloseTransport(t: PoolTransport): Promise<void> {
  try {
    await t.close();
  } catch {
    /* ignore */
  }
}

async function safeCloseClient(c: Client): Promise<void> {
  try {
    await c.close();
  } catch {
    /* ignore */
  }
}

async function disconnectEntry(entry: PoolEntry): Promise<void> {
  await safeCloseClient(entry.client);
  await safeCloseTransport(entry.transport);
}

async function connectRemote(
  url: URL,
  requestInit: RequestInit | undefined,
  mode: McpRemoteTransport,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport | SSEClientTransport }> {
  if (mode === "streamableHttp") {
    const transport = new StreamableHTTPClientTransport(url, { requestInit });
    const client = new Client({ name: "autonomous-browser", version: "1.0.0" });
    await client.connect(transport);
    return { client, transport };
  }
  if (mode === "sse") {
    const transport = new SSEClientTransport(url, { requestInit });
    const client = new Client({ name: "autonomous-browser", version: "1.0.0" });
    await client.connect(transport);
    return { client, transport };
  }

  let streamTransport: StreamableHTTPClientTransport | null = null;
  try {
    streamTransport = new StreamableHTTPClientTransport(url, { requestInit });
    const client = new Client({ name: "autonomous-browser", version: "1.0.0" });
    await client.connect(streamTransport);
    return { client, transport: streamTransport };
  } catch {
    if (streamTransport) await safeCloseTransport(streamTransport);
    const sseTransport = new SSEClientTransport(url, { requestInit });
    const client = new Client({ name: "autonomous-browser", version: "1.0.0" });
    await client.connect(sseTransport);
    return { client, transport: sseTransport };
  }
}

async function createPooledConnection(
  cfg: McpServerConfigPayload,
): Promise<{ client: Client; transport: PoolTransport; starting: Promise<void> }> {
  if (cfg.serverMode === "remote") {
    const url = parseRemoteUrl(cfg.url);
    const headers = parseHeadersJson(cfg.headers || "{}");
    const requestInit: RequestInit =
      Object.keys(headers).length > 0 ? { headers } : {};
    const mode = cfg.remoteTransport || "auto";
    const { client, transport } = await connectRemote(url, requestInit, mode);
    return {
      client,
      transport,
      starting: Promise.resolve(),
    };
  }

  const command = (cfg.command || "").trim();
  if (!command) throw new Error("MCP server command is empty");

  const transport = new StdioClientTransport({
    command,
    args: parseArgsJson(cfg.args),
    env: { ...parseEnvJson(cfg.env) },
    stderr: "pipe",
  });

  const client = new Client({ name: "autonomous-browser", version: "1.0.0" });

  const starting = (async () => {
    await client.connect(transport);
  })();

  return { client, transport, starting };
}

async function ensureClient(cfg: McpServerConfigPayload): Promise<Client> {
  const id = cfg.id;
  const signature = connectionSignature(cfg);

  const existing = pool.get(id);
  if (existing) {
    if (existing.signature !== signature) {
      await disconnectEntry(existing);
      pool.delete(id);
    } else {
      await existing.starting;
      return existing.client;
    }
  }

  const { client, transport, starting } = await createPooledConnection(cfg);
  const entry: PoolEntry = { client, transport, starting, signature };
  pool.set(id, entry);
  await starting;
  return client;
}

export async function externalMcpListTools(cfg: McpServerConfigPayload): Promise<
  Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
> {
  const client = await ensureClient(cfg);
  const res = await client.listTools();
  return (res.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as Record<string, unknown> | undefined,
  }));
}

export async function externalMcpCallTool(
  cfg: McpServerConfigPayload,
  name: string,
  args: unknown,
): Promise<{ content: unknown[]; isError?: boolean }> {
  const client = await ensureClient(cfg);
  const argObj =
    args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const res = await client.callTool({ name, arguments: argObj });
  return {
    content: res.content as unknown[],
    isError: Boolean(res.isError),
  };
}

export async function mcpExternalDisconnect(serverId: string): Promise<void> {
  const entry = pool.get(serverId);
  if (!entry) return;
  await disconnectEntry(entry);
  pool.delete(serverId);
}
