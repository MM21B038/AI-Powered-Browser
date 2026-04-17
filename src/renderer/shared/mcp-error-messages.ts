/** User-facing text for MCP list-tools / connection failures (main no longer throws). */
export function friendlyMcpConnectionError(raw: string): string {
  const s = raw.trim();
  if (/ECONNREFUSED/i.test(s) || /connect ECONNREFUSED/i.test(s)) {
    return "Could not connect (connection refused). Check the URL or port and that the server is running.";
  }
  if (/ENOTFOUND|getaddrinfo/i.test(s)) {
    return "Host could not be reached. Check the server URL.";
  }
  if (/fetch failed|Failed to fetch/i.test(s)) {
    return "Could not reach the MCP server. Check the URL and that the service is running.";
  }
  if (s.length > 160) return `${s.slice(0, 157)}…`;
  return s || "Could not load tools from this server.";
}
