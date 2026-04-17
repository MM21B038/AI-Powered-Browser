import { describe, expect, it } from "vitest";
import { parseMarkdownPipeTables } from "./parse-markdown-pipe-table";

describe("parseMarkdownPipeTables", () => {
  it("parses preamble + pipe table", () => {
    const s = `**Interactables**

| Kind | Label |
| --- | --- |
| link | Learn |
`;
    const r = parseMarkdownPipeTables(s);
    expect(r).not.toBeNull();
    expect(r![0]?.type).toBe("text");
    expect(r![1]).toEqual({
      type: "table",
      headers: ["Kind", "Label"],
      rows: [["link", "Learn"]],
    });
  });

  it("returns null when no pipe table", () => {
    expect(parseMarkdownPipeTables("just prose")).toBeNull();
  });
});
