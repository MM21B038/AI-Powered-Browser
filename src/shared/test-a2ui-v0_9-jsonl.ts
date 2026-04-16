import { describe, expect, it } from "vitest";
import { A2UI_V09_HOST_CATALOG_JSON_URL } from "./a2ui-v0_9-constants";
import { partitionAssistantTextForA2uiV09 } from "./a2ui-v0_9-jsonl";

describe("partitionAssistantTextForA2uiV09", () => {
  it("extracts v0.9 JSONL lines and leaves markdown", () => {
    const text = [
      "Hello",
      "",
      `{"version":"v0.9","createSurface":{"surfaceId":"s","catalogId":"${A2UI_V09_HOST_CATALOG_JSON_URL}"}}`,
      "",
      "More text",
    ].join("\n");
    const out = partitionAssistantTextForA2uiV09(text);
    expect(out.markdown).toContain("Hello");
    expect(out.markdown).toContain("More text");
    expect(out.a2uiV09Jsonl).toContain('"version":"v0.9"');
    expect(out.a2uiV09Jsonl).toContain('"createSurface"');
  });

  it("extracts from jsonl fenced blocks", () => {
    const text = [
      "Intro",
      "",
      "```jsonl",
      '{"version":"v0.9","updateDataModel":{"surfaceId":"s","updates":[{"path":"/x","value":1}]}}',
      "```",
      "",
      "Outro",
    ].join("\n");
    const out = partitionAssistantTextForA2uiV09(text);
    expect(out.a2uiV09Jsonl).toContain('"updateDataModel"');
    expect(out.markdown).toContain("Intro");
    expect(out.markdown).toContain("Outro");
  });

  it("extracts multiple v0.9 JSON objects from one line", () => {
    const oneLine = `{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"${A2UI_V09_HOST_CATALOG_JSON_URL}"}} {"version":"v0.9","updateComponents":{"surfaceId":"main","components":[]}}`;
    const out = partitionAssistantTextForA2uiV09(oneLine);
    expect(out.a2uiV09Jsonl?.split("\n").length).toBe(2);
    expect(out.a2uiV09Jsonl).toContain('"createSurface"');
    expect(out.a2uiV09Jsonl).toContain('"updateComponents"');
  });

  it("extracts v0.9 JSON objects even with prefixes", () => {
    const text = `Line1: {"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"${A2UI_V09_HOST_CATALOG_JSON_URL}"}}\nLine2: {"version":"v0.9","updateComponents":{"surfaceId":"main","components":[]}}`;
    const out = partitionAssistantTextForA2uiV09(text);
    expect(out.a2uiV09Jsonl?.split("\n").length).toBe(2);
  });
});

