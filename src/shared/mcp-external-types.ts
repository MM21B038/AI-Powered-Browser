export type McpRemoteTransport = "auto" | "streamableHttp" | "sse";

export type McpServerConnectionMode = "stdio" | "remote";

export type McpServerConfigPayload = {
  id: string;
  name: string;
  /** When `remote`, connect via `url`; when `stdio`, use `command` / `args` / `env`. */
  serverMode: McpServerConnectionMode;
  command: string;
  args: string;
  env: string;
  /** Remote MCP endpoint (http/https). Used when serverMode is `remote`. */
  url: string;
  /** JSON object: extra HTTP headers (e.g. Authorization). */
  headers: string;
  remoteTransport: McpRemoteTransport;
};
