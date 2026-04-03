import { describe, expect, it } from "vitest";
import type { McpServerConfigPayload } from "../../shared/mcp-external-types";
import { MCP_TOOL_DEFINITIONS } from "../../shared/mcp-tool-registry";
import {
  allocateExternalOpenAiFunctionName,
  buildToolDispatchMap,
  sanitizeOpenAiToolFunctionName,
} from "./ai-tools";

function server(p: Partial<McpServerConfigPayload> & Pick<McpServerConfigPayload, "id">): McpServerConfigPayload {
  return {
    name: "",
    serverMode: "stdio",
    command: "",
    args: "",
    env: "",
    url: "",
    headers: "",
    remoteTransport: "auto",
    ...p,
  };
}

describe("sanitizeOpenAiToolFunctionName", () => {
  it("keeps letters digits underscore hyphen", () => {
    expect(sanitizeOpenAiToolFunctionName("read_file")).toBe("read_file");
    expect(sanitizeOpenAiToolFunctionName("tool-1")).toBe("tool-1");
  });

  it("replaces invalid runs with single underscore", () => {
    expect(sanitizeOpenAiToolFunctionName("foo.bar/baz")).toBe("foo_bar_baz");
  });

  it("uses fallback when empty after sanitize", () => {
    expect(sanitizeOpenAiToolFunctionName("@@@")).toBe("tool");
  });
});

describe("allocateExternalOpenAiFunctionName", () => {
  it("uses base tool name when free", () => {
    const used = new Set<string>(["other"]);
    expect(allocateExternalOpenAiFunctionName(used, server({ id: "a", name: "S" }), "search")).toBe("search");
  });

  it("prefixes with display name when base collides", () => {
    const used = new Set<string>(["search"]);
    expect(
      allocateExternalOpenAiFunctionName(used, server({ id: "m1", name: "Memory" }), "search"),
    ).toBe("Memory_search");
  });

  it("prefixes with id when display name is empty and base collides", () => {
    const used = new Set<string>(["t"]);
    expect(allocateExternalOpenAiFunctionName(used, server({ id: "srv-1", name: "" }), "t")).toBe("srv-1_t");
  });

  it("adds server id when display plus tool still collides", () => {
    const used = new Set<string>(["search", "Dup_search"]);
    expect(
      allocateExternalOpenAiFunctionName(used, server({ id: "idB", name: "Dup" }), "search"),
    ).toBe("Dup_idB_search");
  });

  it("appends numeric suffix when withId still collides", () => {
    const used = new Set<string>(["search", "Dup_search", "Dup_idB_search"]);
    expect(
      allocateExternalOpenAiFunctionName(used, server({ id: "idB", name: "Dup" }), "search"),
    ).toBe("Dup_idB_search_2");
  });
});

describe("buildToolDispatchMap", () => {
  it("maps external names to butcher-safe unique keys", () => {
    const butcher = MCP_TOOL_DEFINITIONS.slice(0, 1);
    const ext = [
      {
        server: server({ id: "e1", name: "Ext" }),
        tools: [{ name: "hello" }],
      },
    ];
    const { openAiTools, dispatch } = buildToolDispatchMap(butcher, ext);
    const names = openAiTools.map((t) => t.function.name);
    expect(names).toContain("butcher_navigate");
    expect(names).toContain("hello");
    expect(dispatch("hello")).toEqual({
      kind: "external",
      server: ext[0].server,
      toolName: "hello",
    });
  });

  it("disambiguates when external tool matches butcher name", () => {
    const butcher = MCP_TOOL_DEFINITIONS.filter((d) => d.name === "butcher_navigate");
    const ext = [
      {
        server: server({ id: "x", name: "X" }),
        tools: [{ name: "butcher_navigate" }],
      },
    ];
    const { openAiTools, dispatch } = buildToolDispatchMap(butcher, ext);
    const extEntry = openAiTools.find((t) => t.function.name !== "butcher_navigate");
    expect(extEntry?.function.name).toMatch(/^X_butcher_navigate$/);
    expect(dispatch("butcher_navigate")?.kind).toBe("butcher");
    expect(dispatch(extEntry!.function.name)).toEqual({
      kind: "external",
      server: ext[0].server,
      toolName: "butcher_navigate",
    });
  });
});
