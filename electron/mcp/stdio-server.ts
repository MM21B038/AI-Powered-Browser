/**
 * Stdio MCP server: registers Butcher tools and forwards each call to the Electron TCP bridge
 * (BUTCHER_MCP_PORT + BUTCHER_MCP_TOKEN). Run with: node stdio-server.js
 */
import net from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { MCP_TOOL_DEFINITIONS } from "../../src/shared/mcp-tool-registry";

let nextBridgeId = 1;

function bridgeToolsCall(port: number, token: string, toolName: string, args: unknown): Promise<unknown> {
  const id = nextBridgeId++;
  const payload = JSON.stringify({
    id,
    token,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args && typeof args === "object" && !Array.isArray(args) ? args : {},
    },
  });
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: "127.0.0.1", port }, () => {
      sock.write(`${payload}\n`);
    });
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const line = buf.slice(0, nl).trim();
      sock.destroy();
      try {
        const parsed = JSON.parse(line) as {
          id?: number;
          result?: unknown;
          error?: { message?: string; code?: string };
        };
        if (parsed.error) {
          reject(new Error(parsed.error.message || "bridge error"));
          return;
        }
        resolve(parsed.result);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    sock.on("error", (err) => {
      reject(err);
    });
  });
}

async function main(): Promise<void> {
  const port = Number(process.env.BUTCHER_MCP_PORT || "47842");
  const token = process.env.BUTCHER_MCP_TOKEN || "";
  if (!token.trim()) {
    console.error("Butcher MCP: set BUTCHER_MCP_TOKEN to match the token in app settings.");
    process.exit(1);
  }

  const mcp = new McpServer({
    name: "butcher-browser-automation",
    version: "1.0.0",
  });

  const looseArgs = z.record(z.string(), z.unknown());

  for (const def of MCP_TOOL_DEFINITIONS) {
    const name = def.name;
    mcp.registerTool(
      name,
      {
        description: def.description,
        inputSchema: looseArgs,
      },
      async (args) => {
        const result = await bridgeToolsCall(port, token, name, args);
        const text =
          result === undefined || result === null
            ? ""
            : typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2);
        return {
          content: [{ type: "text" as const, text }],
        };
      },
    );
  }

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
