import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { BrowserWindow } from "electron";
import type { AutomationCommand, AutomationResult } from "../../src/shared/automation-types";
import {
  automationCommandFromMcpTool,
  sanitizeAutomationResultForMcp,
} from "../../src/shared/mcp-tool-registry";

const DEFAULT_PORT = 47842;
const DEFAULT_INTELLIGENT_PORT = 47843;
const CONFIG_FILENAME = "mcp-bridge.json";

export type McpBridgeFileConfig = {
  enabled: boolean;
  port: number;
  token: string;
  intelligentPort: number;
  intelligentToken: string;
  servers?: {
    browser?: { name?: string };
    intelligent?: { name?: string };
  };
};

function defaultConfig(): McpBridgeFileConfig {
  return {
    enabled: false,
    port: DEFAULT_PORT,
    token: randomToken(),
    intelligentPort: DEFAULT_INTELLIGENT_PORT,
    intelligentToken: randomToken(),
  };
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Buffer.from(bytes).toString("base64url");
}

/** New random token for MCP bridge auth (persist with saveMcpBridgeConfig). */
export function generateMcpToken(): string {
  return randomToken();
}

export function getMcpBridgeConfigPath(userData: string): string {
  return path.join(userData, CONFIG_FILENAME);
}

export function loadMcpBridgeConfig(userData: string): McpBridgeFileConfig {
  const p = getMcpBridgeConfigPath(userData);
  try {
    if (!fs.existsSync(p)) {
      const cfg = defaultConfig();
      fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
      return cfg;
    }
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<McpBridgeFileConfig>;
    const base = defaultConfig();
    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
      port: typeof raw.port === "number" && raw.port > 0 && raw.port < 65536 ? raw.port : base.port,
      token: typeof raw.token === "string" && raw.token.length >= 16 ? raw.token : base.token,
      intelligentPort:
        typeof raw.intelligentPort === "number" && raw.intelligentPort > 0 && raw.intelligentPort < 65536
          ? raw.intelligentPort
          : base.intelligentPort,
      intelligentToken:
        typeof raw.intelligentToken === "string" && raw.intelligentToken.length >= 16
          ? raw.intelligentToken
          : base.intelligentToken,
      servers:
        raw.servers && typeof raw.servers === "object"
          ? {
              browser:
                raw.servers.browser && typeof raw.servers.browser === "object"
                  ? { name: typeof raw.servers.browser.name === "string" ? raw.servers.browser.name : "Browser Server" }
                  : { name: "Browser Server" },
              intelligent:
                raw.servers.intelligent && typeof raw.servers.intelligent === "object"
                  ? {
                      name:
                        typeof raw.servers.intelligent.name === "string"
                          ? raw.servers.intelligent.name
                          : "Intelligent Server",
                    }
                  : { name: "Intelligent Server" },
            }
          : {
              browser: { name: "Browser Server" },
              intelligent: { name: "Intelligent Server" },
            },
    };
  } catch {
    return defaultConfig();
  }
}

export function saveMcpBridgeConfig(userData: string, cfg: McpBridgeFileConfig): void {
  const p = getMcpBridgeConfigPath(userData);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
}

const tcpServers: Record<"browser" | "intelligent", net.Server | null> = {
  browser: null,
  intelligent: null,
};
const queues: Record<"browser" | "intelligent", Promise<void>> = {
  browser: Promise.resolve(),
  intelligent: Promise.resolve(),
};

function runSerialized(kind: "browser" | "intelligent") {
  return async function <T>(fn: () => Promise<T>): Promise<T> {
    const run = queues[kind].then(fn, fn);
    queues[kind] = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

function toolAllowedForKind(kind: "browser" | "intelligent", name: string): boolean {
  return kind === "browser" ? name.startsWith("butcher_") : name.startsWith("intelligent_");
}

export function getBridgeListeningPort(kind: "browser" | "intelligent" = "browser"): number | null {
  const a = tcpServers[kind]?.address();
  if (a && typeof a === "object") return a.port;
  return null;
}

export function stopMcpBridge(kind: "browser" | "intelligent" = "browser"): void {
  const srv = tcpServers[kind];
  if (srv) {
    srv.close();
    tcpServers[kind] = null;
  }
}

export function stopAllMcpBridges(): void {
  stopMcpBridge("browser");
  stopMcpBridge("intelligent");
}

export function startMcpBridge(
  kind: "browser" | "intelligent",
  getWindow: () => BrowserWindow | null,
  port: number,
  token: string,
  onError: (msg: string) => void,
): void {
  stopMcpBridge(kind);
  const srv = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buf = "";
    socket.on("data", (chunk: string) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        void handleLine(socket, line, kind, getWindow, token, onError);
      }
    });
    socket.on("error", () => {
      /* ignore */
    });
  });
  srv.on("error", (err: NodeJS.ErrnoException) => {
    onError(err.message || String(err));
  });
  srv.listen(port, "127.0.0.1", () => {
    /* listening */
  });
  tcpServers[kind] = srv;
}


type BridgeRequest = {
  id?: string | number;
  token: string;
  method: "ping" | "tools/call";
  params?: { name?: string; arguments?: unknown };
};

type BridgeResponse =
  | { id?: string | number; result?: unknown; error?: { message: string; code?: string } };

async function handleLine(
  socket: net.Socket,
  line: string,
  kind: "browser" | "intelligent",
  getWindow: () => BrowserWindow | null,
  token: string,
  onError: (msg: string) => void,
): Promise<void> {
  let req: BridgeRequest;
  try {
    req = JSON.parse(line) as BridgeRequest;
  } catch {
    writeSocket(socket, { error: { message: "invalid JSON" } });
    return;
  }

  const id = req.id;

  if (typeof req.token !== "string" || req.token !== token) {
    writeSocket(socket, { id, error: { message: "unauthorized", code: "UNAUTHORIZED" } });
    return;
  }

  if (req.method === "ping") {
    writeSocket(socket, { id, result: { ok: true, ts: Date.now() } });
    return;
  }

  if (req.method === "tools/call" && req.params && typeof req.params.name === "string") {
    const name = req.params.name;
    if (!toolAllowedForKind(kind, name)) {
      writeSocket(socket, { id, error: { message: `tool not available on ${kind} bridge`, code: "TOOL_NOT_ALLOWED" } });
      return;
    }
    const args = req.params.arguments ?? {};
    const cmdOrErr = automationCommandFromMcpTool(name, args);
    if (cmdOrErr instanceof Error) {
      writeSocket(socket, { id, error: { message: cmdOrErr.message, code: "INVALID_ARGS" } });
      return;
    }

    try {
      const result = await runSerialized(kind)(() => invokeAutomationInRenderer(getWindow, cmdOrErr));
      writeSocket(socket, { id, result: sanitizeAutomationResultForMcp(result) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onError(msg);
      writeSocket(socket, { id, error: { message: msg, code: "EXECUTION_ERROR" } });
    }
    return;
  }

  writeSocket(socket, { id, error: { message: "unknown method", code: "UNKNOWN_METHOD" } });
}

function writeSocket(socket: net.Socket, payload: BridgeResponse): void {
  try {
    socket.write(`${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }
}

async function invokeAutomationInRenderer(
  getWindow: () => BrowserWindow | null,
  cmd: AutomationCommand,
): Promise<AutomationResult> {
  const win = getWindow();
  if (!win || win.isDestroyed()) {
    throw new Error("Browser window not available");
  }
  const cmdJson = JSON.stringify(cmd);
  const raw = await win.webContents.executeJavaScript(
    `
    (async () => {
      const cmd = ${cmdJson};
      const fn = window.__mcpInvokeAutomation;
      if (typeof fn !== "function") throw new Error("MCP bridge not ready (open app and enable bridge)");
      return await fn(cmd);
    })()
    `,
    true,
  );
  return raw as AutomationResult;
}
