import { describe, expect, it } from "vitest";
import { validateA2uiJsonlLinesStrict } from "../../shared/a2ui-strict-validate";
import {
  assistantChatMarkdownWithoutA2ui,
  coerceLlmShortcutsInA2uiJsonl,
  ensureBeginRenderingForJsonl,
  explainA2uiMissingComponentTree,
  mergeA2uiJsonlParts,
  normalizeIntelligentA2uiSubmitJsonlInput,
  normalizeAlternateA2uiShape,
  orderA2uiJsonlServerMessages,
  isLikelyIncompleteStreamingA2uiJsonl,
  partitionAssistantTextForA2ui,
  pickRenderingRootFromComponents,
  repairSurfaceUpdateLayout,
  rewriteA2uiJsonlSurfaceIds,
  validateIntelligentA2uiSubmitJsonl,
} from "../../shared/a2ui-jsonl";

/** Minimal catalog-valid component for strict v0.8 tests (`surfaceUpdate.components` is non-empty). */
const textComp = (id: string, text: string) => ({
  id,
  component: { Text: { text: { literalString: text } } },
});

describe("isLikelyIncompleteStreamingA2uiJsonl", () => {
  it("is true when the last line is not yet valid JSON", () => {
    expect(isLikelyIncompleteStreamingA2uiJsonl('{"a":1}\n{"b":')).toBe(true);
  });

  it("is false when every line parses", () => {
    expect(
      isLikelyIncompleteStreamingA2uiJsonl(
        '{"surfaceUpdate":{"surfaceId":"x","components":[]}}\n{"beginRendering":{"surfaceId":"x","root":"r"}}',
      ),
    ).toBe(false);
  });
});

describe("assistantChatMarkdownWithoutA2ui", () => {
  it("matches partition markdown (no duplicate JSON in chat bubble)", () => {
    const line = JSON.stringify({
      surfaceUpdate: { surfaceId: "x", components: [] },
    });
    const full = `Here you go\n\n\`\`\`jsonl\n${line}\n\`\`\`\n`;
    const part = partitionAssistantTextForA2ui(full);
    expect(part.a2uiJsonl).toBeDefined();
    expect(assistantChatMarkdownWithoutA2ui(full)).toBe(part.markdown);
  });
});

describe("partitionAssistantTextForA2ui", () => {
  it("keeps plain markdown when no A2UI lines", () => {
    const r = partitionAssistantTextForA2ui("Hello **world**");
    expect(r.markdown).toBe("Hello **world**");
    expect(r.a2uiJsonl).toBeUndefined();
  });

  it("extracts JSONL A2UI lines", () => {
    const line = JSON.stringify({
      surfaceUpdate: { surfaceId: "s1", components: [] },
    });
    const r = partitionAssistantTextForA2ui(`Intro\n${line}`);
    expect(r.markdown).toBe("Intro");
    expect(r.a2uiJsonl).toContain("surfaceUpdate");
  });

  it("extracts A2UI from a fenced json block", () => {
    const msg = {
      beginRendering: { surfaceId: "main", root: "root" },
    };
    const body = JSON.stringify(msg, null, 2);
    const full = `Here is the UI:\n\n\`\`\`json\n${body}\n\`\`\`\n\nThanks.`;
    const r = partitionAssistantTextForA2ui(full);
    expect(r.markdown).not.toContain("beginRendering");
    expect(r.a2uiJsonl).toContain("beginRendering");
    expect(r.a2uiJsonl).toContain("root");
  });

  it("extracts an array of messages from a fence", () => {
    const a = { surfaceUpdate: { surfaceId: "x", components: [] } };
    const b = { dataModelUpdate: { surfaceId: "x", contents: [] } };
    const full = `Intro\n\n\`\`\`\n${JSON.stringify([a, b])}\n\`\`\``;
    const r = partitionAssistantTextForA2ui(full);
    expect(r.markdown.trim()).toBe("Intro");
    const lines = r.a2uiJsonl?.split("\n") ?? [];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("surfaceUpdate");
    expect(lines[1]).toContain("dataModelUpdate");
  });

  it("merges line JSONL and fenced JSON in document order", () => {
    const line = JSON.stringify({
      deleteSurface: { surfaceId: "z" },
    });
    const fenced = JSON.stringify({
      beginRendering: { surfaceId: "y", root: "r" },
    });
    const full = `${line}\n\nText between.\n\n\`\`\`json\n${fenced}\n\`\`\``;
    const r = partitionAssistantTextForA2ui(full);
    expect(r.a2uiJsonl?.indexOf("deleteSurface")).toBeLessThan(
      r.a2uiJsonl!.indexOf("beginRendering"),
    );
    expect(r.markdown).toContain("Text between.");
  });

  it("preserves fenced blocks that are not A2UI (e.g. HTML/CSS)", () => {
    const fence = "```html\n<div>hi</div>\n```";
    const r = partitionAssistantTextForA2ui(`Intro\n\n${fence}\n\nOutro`);
    expect(r.markdown).toContain("```html");
    expect(r.markdown).toContain("<div>hi</div>");
    expect(r.markdown).toContain("Outro");
    expect(r.a2uiJsonl).toBeUndefined();
  });

  it("preserves a standalone HTML fence when it is the whole message", () => {
    const r = partitionAssistantTextForA2ui("```css\n.box { color: red; }\n```");
    expect(r.markdown).toContain("```css");
    expect(r.markdown).toContain(".box");
    expect(r.a2uiJsonl).toBeUndefined();
  });

  it("extracts NDJSON from an unclosed trailing ```json fence (streaming)", () => {
    const line = JSON.stringify({
      surfaceUpdate: { surfaceId: "s", components: [] },
    });
    const partial = `Here is UI:\n\n\`\`\`json\n${line}`;
    const r = partitionAssistantTextForA2ui(partial);
    expect(r.markdown.trim()).toBe("Here is UI:");
    expect(r.a2uiJsonl).toContain("surfaceUpdate");
  });

  it("uses the last open ```jsonl fence when multiple json fences exist", () => {
    const a = JSON.stringify({
      surfaceUpdate: { surfaceId: "x", components: [textComp("root", "x")] },
    });
    const b = JSON.stringify({
      beginRendering: { surfaceId: "x", root: "root" },
    });
    const full = `intro\n\n\`\`\`json\n${a}\n\`\`\`\n\nmore\n\n\`\`\`jsonl\n${b}`;
    const r = partitionAssistantTextForA2ui(full);
    expect(r.markdown).toContain("more");
    expect(r.a2uiJsonl).toContain("surfaceUpdate");
    expect(r.a2uiJsonl).toContain("beginRendering");
  });
});

describe("explainA2uiMissingComponentTree", () => {
  it("detects missing beginRendering", () => {
    const msg = {
      surfaceUpdate: {
        surfaceId: "main",
        components: [textComp("a", "x")],
      },
    };
    expect(explainA2uiMissingComponentTree([msg])).toContain("beginRendering");
  });

  it("detects root id mismatch", () => {
    const messages = [
      {
        surfaceUpdate: {
          surfaceId: "main",
          components: [textComp("onlyId", "x")],
        },
      },
      { beginRendering: { surfaceId: "main", root: "wrong" } },
    ];
    expect(explainA2uiMissingComponentTree(messages)).toContain("wrong");
    expect(explainA2uiMissingComponentTree(messages)).toContain("onlyId");
  });
});

describe("validateA2uiJsonlLinesStrict", () => {
  it("accepts a quickstart-style golden stream (surfaceUpdate → dataModelUpdate → beginRendering)", () => {
    const jsonl = [
      JSON.stringify({
        surfaceUpdate: {
          surfaceId: "main",
          components: [
            {
              id: "root",
              component: { Column: { children: { explicitList: ["title"] } } },
            },
            textComp("title", "Hello"),
          ],
        },
      }),
      JSON.stringify({
        dataModelUpdate: {
          surfaceId: "main",
          path: "/",
          contents: [{ key: "k", valueString: "v" }],
        },
      }),
      JSON.stringify({
        beginRendering: { surfaceId: "main", root: "root" },
      }),
    ].join("\n");
    const r = validateA2uiJsonlLinesStrict(jsonl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.messages).toHaveLength(3);
  });

  it("rejects surfaceUpdate with empty components", () => {
    const jsonl = JSON.stringify({
      surfaceUpdate: { surfaceId: "x", components: [] },
    });
    const r = validateA2uiJsonlLinesStrict(jsonl);
    expect(r.ok).toBe(false);
  });
});

describe("normalizeIntelligentA2uiSubmitJsonlInput", () => {
  it("joins an array of JSON strings into NDJSON", () => {
    const a = JSON.stringify({ surfaceUpdate: { surfaceId: "x", components: [textComp("root", "a")] } });
    const b = JSON.stringify({ beginRendering: { surfaceId: "x", root: "root" } });
    const s = normalizeIntelligentA2uiSubmitJsonlInput([a, b]);
    expect(s.split("\n")).toHaveLength(2);
    const v = validateIntelligentA2uiSubmitJsonl(s);
    expect(v.ok).toBe(true);
  });

  it("serializes an array of objects into NDJSON", () => {
    const s = normalizeIntelligentA2uiSubmitJsonlInput([
      { surfaceUpdate: { surfaceId: "y", components: [textComp("root", "b")] } },
      { beginRendering: { surfaceId: "y", root: "root" } },
    ]);
    const v = validateIntelligentA2uiSubmitJsonl(s);
    expect(v.ok).toBe(true);
  });

  it("turns literal \\\\n between objects into a real newline", () => {
    const su = JSON.stringify({
      surfaceUpdate: { surfaceId: "lit", components: [textComp("root", "u")] },
    });
    const br = JSON.stringify({
      beginRendering: { surfaceId: "lit", root: "root" },
    });
    const s = normalizeIntelligentA2uiSubmitJsonlInput(`${su}\\n${br}`);
    expect(s.includes("\n")).toBe(true);
    const v = validateIntelligentA2uiSubmitJsonl(s);
    expect(v.ok).toBe(true);
  });
});

describe("validateIntelligentA2uiSubmitJsonl", () => {
  it("reports line number when compact NDJSON has a syntax error on line 1", () => {
    const line1 = '{"surfaceUpdate":{"surfaceId":"main","components":[]}}}}'; // extra }
    const line2 = JSON.stringify({
      beginRendering: { surfaceId: "main", root: "root" },
    });
    const v = validateIntelligentA2uiSubmitJsonl(`${line1}\n${line2}`);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error).toContain("Line 1");
      expect(v.error).not.toBe("Invalid JSON in multi-object payload.");
    }
  });

  it("accepts alternate type-keyed messages on one line each", () => {
    const jsonl = [
      JSON.stringify({
        type: "surfaceUpdate",
        surfaceId: "root",
        components: [
          {
            id: "mainColumn",
            component: { Column: { children: { explicitList: [] } } },
          },
        ],
      }),
      JSON.stringify({
        type: "beginRendering",
        surfaceId: "root",
        root: "mainColumn",
      }),
    ].join("\n");
    const v = validateIntelligentA2uiSubmitJsonl(jsonl);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.normalized).toContain('"surfaceUpdate"');
      expect(v.normalized).toContain('"beginRendering"');
    }
  });

  it("accepts pretty-printed multi-object blob", () => {
    const blob = `{
  "type": "surfaceUpdate",
  "surfaceId": "s",
  "components": [
    { "id": "r", "component": { "Text": { "text": { "literalString": "x" } } } }
  ]
}
{
  "type": "beginRendering",
  "surfaceId": "s",
  "root": "r"
}`;
    const v = validateIntelligentA2uiSubmitJsonl(blob);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.normalized.split("\n")).toHaveLength(2);
  });

  it("accepts valid JSONL lines", () => {
    const jsonl = [
      JSON.stringify({
        surfaceUpdate: {
          surfaceId: "x",
          components: [textComp("root", "hi")],
        },
      }),
      JSON.stringify({ beginRendering: { surfaceId: "x", root: "root" } }),
    ].join("\n");
    const v = validateIntelligentA2uiSubmitJsonl(jsonl);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.normalized.split("\n")).toHaveLength(2);
  });

  it("accepts two root objects glued on one line inside multi-line NDJSON", () => {
    const su = JSON.stringify({
      surfaceUpdate: { surfaceId: "glue2", components: [textComp("root", "u")] },
    });
    const br = JSON.stringify({
      beginRendering: { surfaceId: "glue2", root: "root" },
    });
    const del = JSON.stringify({ deleteSurface: { surfaceId: "glue2" } });
    const jsonl = `${su}${br}\n${del}`;
    const v = validateIntelligentA2uiSubmitJsonl(jsonl);
    expect(v.ok).toBe(true);
  });

  it("parses dataModelUpdate.contents entries that are JSON strings", () => {
    const su = JSON.stringify({
      surfaceUpdate: { surfaceId: "dm", components: [textComp("root", "u")] },
    });
    const dm = JSON.stringify({
      dataModelUpdate: {
        surfaceId: "dm",
        path: "/",
        contents: [JSON.stringify({ key: "k", valueString: "v" })],
      },
    });
    const br = JSON.stringify({
      beginRendering: { surfaceId: "dm", root: "root" },
    });
    const v = validateIntelligentA2uiSubmitJsonl([su, dm, br].join("\n"));
    expect(v.ok).toBe(true);
  });

  it("rejects invalid lines", () => {
    const v = validateIntelligentA2uiSubmitJsonl("{ not json");
    expect(v.ok).toBe(false);
  });

  it("coerces Checkbox valueBoolean mistakes into schema value.literalBoolean", () => {
    const surfaceUpdate = {
      surfaceUpdate: {
        surfaceId: "todo",
        components: [
          {
            id: "root",
            component: {
              Column: {
                children: { explicitList: ["c1"] },
                distribution: "start",
                alignment: "stretch",
              },
            },
          },
          {
            id: "c1",
            component: {
              Checkbox: {
                label: { literalString: "" },
                valueBoolean: { literalString: "false" },
              },
            },
          },
        ],
      },
    };
    const br = { beginRendering: { surfaceId: "todo", root: "root" } };
    const v = validateIntelligentA2uiSubmitJsonl(
      `${JSON.stringify(surfaceUpdate)}\n${JSON.stringify(br)}`,
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.normalized).toContain('"literalBoolean":false');
      expect(v.normalized.includes("valueBoolean")).toBe(false);
    }
  });

  it("repairs an extra } before ,{\"id\":… between surfaceUpdate components (common LLM typo)", () => {
    const validMsg = {
      surfaceUpdate: {
        surfaceId: "m",
        components: [
          {
            id: "r",
            component: {
              Column: {
                children: { explicitList: ["a"] },
                distribution: "start",
                alignment: "stretch",
              },
            },
          },
          {
            id: "a",
            component: {
              Text: { text: { literalString: "x" }, usageHint: "body" },
            },
          },
        ],
      },
    };
    const good = JSON.stringify(validMsg);
    const breakAt = good.indexOf(',{"id":"a"');
    expect(breakAt).toBeGreaterThan(0);
    const bad = `${good.slice(0, breakAt)}}${good.slice(breakAt)}`;
    expect(() => JSON.parse(bad)).toThrow();
    const v = validateIntelligentA2uiSubmitJsonl(
      `${bad}\n${JSON.stringify({ beginRendering: { surfaceId: "m", root: "r" } })}`,
    );
    expect(v.ok).toBe(true);
  });

  it("splits surfaceUpdate+beginRendering in one JSON object and coerces common LLM shortcut shapes", () => {
    const one = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "todoSurface",
        components: [
          {
            id: "root",
            component: {
              Column: {
                children: { explicitList: ["tf1", "b1"] },
                distribution: "start",
                alignment: "stretch",
              },
            },
          },
          {
            id: "tf1",
            component: {
              TextField: {
                label: { literalString: "Task" },
                textFieldType: { literalString: "shortText" },
              },
            },
          },
          {
            id: "b1",
            component: {
              Button: {
                primary: true,
                label: { literalString: "Go" },
                action: {
                  name: { literalString: "go" },
                  context: { taskId: { literalString: "t1" } },
                },
              },
            },
          },
        ],
      },
      beginRendering: { surfaceId: "todoSurface", root: "root" },
    });
    const v = validateIntelligentA2uiSubmitJsonl(one);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.normalized.split("\n").length).toBe(2);
      expect(v.normalized).toContain('"textFieldType":"shortText"');
      expect(v.normalized).toContain('"name":"go"');
      expect(v.normalized).toContain('"key":"taskId"');
    }
  });
});

describe("normalizeAlternateA2uiShape", () => {
  it("maps type surfaceUpdate to v0.8", () => {
    const n = normalizeAlternateA2uiShape({
      type: "surfaceUpdate",
      surfaceId: "x",
      components: [],
    } as Record<string, unknown>);
    expect(n?.surfaceUpdate).toBeDefined();
    expect((n?.surfaceUpdate as { surfaceId: string }).surfaceId).toBe("x");
  });
});

describe("mergeA2uiJsonlParts", () => {
  it("joins multiple blobs", () => {
    const a = JSON.stringify({ deleteSurface: { surfaceId: "z" } });
    const b = JSON.stringify({ beginRendering: { surfaceId: "z", root: "r" } });
    const m = mergeA2uiJsonlParts(a, b);
    expect(m?.split("\n")).toHaveLength(2);
  });
});

describe("orderA2uiJsonlServerMessages", () => {
  it("moves beginRendering after surfaceUpdate", () => {
    const a = JSON.stringify({
      beginRendering: { surfaceId: "x", root: "root" },
    });
    const b = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "x",
        components: [textComp("root", "x")],
      },
    });
    const out = orderA2uiJsonlServerMessages(`${a}\n${b}`);
    const lines = out.split("\n").filter((l) => l.trim());
    expect(lines[0]).toContain("surfaceUpdate");
    expect(lines[1]).toContain("beginRendering");
  });
});

describe("pickRenderingRootFromComponents", () => {
  it("prefers a Column over a leading Text node", () => {
    const r = pickRenderingRootFromComponents([
      { id: "title", component: { Text: { text: { literalString: "Hi" } } } },
      {
        id: "main",
        component: { Column: { children: { explicitList: [] } } },
      },
    ]);
    expect(r).toBe("main");
  });
});

describe("repairSurfaceUpdateLayout", () => {
  it("wires a single Column to every other component id in order", () => {
    const comps: Record<string, unknown>[] = [
      { id: "t", component: { Text: { text: { literalString: "x" } } } },
      {
        id: "root",
        component: { Column: { children: { explicitList: [] } } },
      },
      {
        id: "s",
        component: {
          Slider: {
            value: { literalNumber: 1 },
            label: { literalString: "y" },
          },
        },
      },
    ];
    repairSurfaceUpdateLayout(comps);
    const col = (
      comps[1] as {
        component: { Column: { children: { explicitList: string[] } } };
      }
    ).component.Column;
    expect(col.children.explicitList).toEqual(["t", "s"]);
  });
});

describe("ensureBeginRenderingForJsonl", () => {
  it("appends beginRendering when surfaceUpdate has components but none was sent", () => {
    const line = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "main",
        components: [
          {
            id: "root",
            component: { Column: { children: { explicitList: [] } } },
          },
        ],
      },
    });
    const out = ensureBeginRenderingForJsonl(line, "surf-1");
    const lines = out.split("\n").filter((l) => l.trim());
    expect(lines.length).toBe(2);
    const last = JSON.parse(lines[lines.length - 1]!);
    expect(last.beginRendering.root).toBe("root");
    expect(last.beginRendering.surfaceId).toBe("surf-1");
  });

  it("does not append when beginRendering already present", () => {
    const a = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "x",
        components: [{ id: "cid", component: { Text: { text: { literalString: "x" } } } }],
      },
    });
    const b = JSON.stringify({ beginRendering: { surfaceId: "x", root: "cid" } });
    const out = ensureBeginRenderingForJsonl(`${a}\n${b}`, "surf-1");
    expect(out.split("\n").filter((l) => l.trim()).length).toBe(2);
  });

  it("fills empty root on beginRendering when inferrable", () => {
    const su = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "x",
        components: [{ id: "myRoot", component: { Text: { text: { literalString: "t" } } } }],
      },
    });
    const br = JSON.stringify({ beginRendering: { surfaceId: "x", root: "" } });
    const out = ensureBeginRenderingForJsonl(`${su}\n${br}`, "surf-1");
    const lines = out.split("\n").filter((l) => l.trim());
    const last = JSON.parse(lines[lines.length - 1]!);
    expect(last.beginRendering.root).toBe("myRoot");
  });
});

describe("coerceLlmShortcutsInA2uiJsonl", () => {
  it("coerces Text.content, Image.src, MultipleChoice string options, Slider min/max, TextField placeholder", () => {
    const line = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "s",
        components: [
          { id: "t1", component: { Text: { content: "Title" } } },
          {
            id: "g",
            component: {
              Image: { src: "https://quickchart.io/chart?c=test" },
            },
          },
          {
            id: "mc",
            component: {
              MultipleChoice: {
                options: ["A", "B", "C"],
                selected: "B",
              },
            },
          },
          {
            id: "sl",
            component: {
              Slider: { label: "Rate", min: 0, max: 20, value: 5 },
            },
          },
          {
            id: "tf",
            component: {
              TextField: { placeholder: "Enter amount" },
            },
          },
        ],
      },
    });
    const out = coerceLlmShortcutsInA2uiJsonl(line);
    const obj = JSON.parse(out) as {
      surfaceUpdate: { components: Array<{ id: string; component: Record<string, unknown> }> };
    };
    const comps = obj.surfaceUpdate.components;
    const t1 = comps.find((x) => x.id === "t1")!.component.Text as {
      text: { literalString: string };
    };
    expect(t1.text.literalString).toBe("Title");
    const img = comps.find((x) => x.id === "g")!.component.Image as {
      url: { literalString: string };
    };
    expect(img.url.literalString).toContain("quickchart.io");
    const mch = comps.find((x) => x.id === "mc")!.component.MultipleChoice as {
      selections: { literalArray: string[] };
      options: Array<{ label: { literalString: string }; value: string }>;
    };
    expect(mch.options[0]?.value).toBe("A");
    expect(mch.selections.literalArray).toEqual(["B"]);
    const sl = comps.find((x) => x.id === "sl")!.component.Slider as {
      minValue: number;
      maxValue: number;
      value: { literalNumber: number };
    };
    expect(sl.minValue).toBe(0);
    expect(sl.maxValue).toBe(20);
    expect(sl.value.literalNumber).toBe(5);
    const tf = comps.find((x) => x.id === "tf")!.component.TextField as {
      label: { literalString: string };
    };
    expect(tf.label.literalString).toBe("Enter amount");
  });

  it("coerces Text string, Slider primitives, Button without child, Image url string", () => {
    const line = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "s",
        components: [
          { id: "a", component: { Text: "Hello" } },
          {
            id: "b",
            component: {
              Slider: { label: "L", minValue: 0, maxValue: 10 },
            },
          },
          { id: "c", component: { Button: { label: "OK" } } },
          { id: "d", component: { Image: { url: "https://x.test/i.png" } } },
        ],
      },
    });
    const out = coerceLlmShortcutsInA2uiJsonl(line);
    const obj = JSON.parse(out) as {
      surfaceUpdate: {
        components: Array<{ id: string; component: Record<string, unknown> }>;
      };
    };
    const comps = obj.surfaceUpdate.components;
    const textA = comps.find((x) => x.id === "a")!.component.Text as {
      text: { literalString: string };
    };
    expect(textA.text.literalString).toBe("Hello");
    const sliderB = comps.find((x) => x.id === "b")!.component.Slider as {
      value: { literalNumber: number };
      label: { literalString: string };
    };
    expect(sliderB.value.literalNumber).toBe(0);
    expect(sliderB.label.literalString).toBe("L");
    const btn = comps.find((x) => x.id === "c")!.component.Button as {
      child: string;
      action: { name: string };
    };
    expect(btn.child).toMatch(/^c__a2ui/);
    expect(btn.action.name).toBe("primaryAction");
    const img = comps.find((x) => x.id === "d")!.component.Image as {
      url: { literalString: string };
    };
    expect(img.url.literalString).toBe("https://x.test/i.png");
    const synthetic = comps.find((c) => c.id === btn.child);
    expect(synthetic?.component).toBeDefined();
  });

  it("coerces Text.usageHint aliases and drops unknown hints", () => {
    const line = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "s",
        components: [
          {
            id: "t1",
            component: {
              Text: { text: { literalString: "A" }, usageHint: "title" },
            },
          },
          {
            id: "t2",
            component: {
              Text: { text: { literalString: "B" }, usageHint: "button" },
            },
          },
          {
            id: "t3",
            component: {
              Text: { text: { literalString: "C" }, usageHint: "notARealUsage" },
            },
          },
        ],
      },
    });
    const out = coerceLlmShortcutsInA2uiJsonl(line);
    const obj = JSON.parse(out) as {
      surfaceUpdate: {
        components: Array<{ id: string; component: { Text: { usageHint?: string } } }>;
      };
    };
    const c = obj.surfaceUpdate.components;
    expect(c[0]!.component.Text.usageHint).toBe("h3");
    expect(c[1]!.component.Text.usageHint).toBe("body");
    expect(c[2]!.component.Text.usageHint).toBeUndefined();
    expect(validateA2uiJsonlLinesStrict(out).ok).toBe(true);
  });

  it("coerces Row children.template.dataBinding from { path } to string", () => {
    const line = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "s",
        components: [
          {
            id: "r1",
            component: {
              Row: {
                children: {
                  template: {
                    componentId: "cell",
                    dataBinding: { path: "/rows" },
                  },
                },
              },
            },
          },
          {
            id: "cell",
            component: {
              Text: { text: { literalString: "item" } },
            },
          },
        ],
      },
    });
    const out = coerceLlmShortcutsInA2uiJsonl(line);
    const obj = JSON.parse(out) as {
      surfaceUpdate: {
        components: Array<{
          component: {
            Row: { children: { template: { dataBinding: string } } };
          };
        }>;
      };
    };
    expect(obj.surfaceUpdate.components[0]!.component.Row.children.template.dataBinding).toBe(
      "/rows",
    );
    expect(validateA2uiJsonlLinesStrict(out).ok).toBe(true);
  });

  it("coerces Card.content / Card.childId into Card.child", () => {
    const line = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "s",
        components: [
          {
            id: "c1",
            component: {
              Card: { content: "inner1" },
            },
          },
          {
            id: "c2",
            component: {
              Card: { childId: "inner2" },
            },
          },
          {
            id: "inner1",
            component: { Text: { text: { literalString: "A" }, usageHint: "body" } },
          },
          {
            id: "inner2",
            component: { Text: { text: { literalString: "B" }, usageHint: "body" } },
          },
        ],
      },
    });
    const out = coerceLlmShortcutsInA2uiJsonl(line);
    const obj = JSON.parse(out) as {
      surfaceUpdate: {
        components: Array<{ id: string; component: { Card?: { child: string } } }>;
      };
    };
    const byId = new Map(obj.surfaceUpdate.components.map((x) => [x.id, x]));
    expect(byId.get("c1")!.component.Card!.child).toBe("inner1");
    expect(byId.get("c2")!.component.Card!.child).toBe("inner2");
    expect(validateA2uiJsonlLinesStrict(out).ok).toBe(true);
  });
});

describe("dataModelUpdate valueMap wire shape (v0.8)", () => {
  it("rejects valueMap as a plain object (common LLM mistake)", () => {
    const bad = JSON.stringify({
      dataModelUpdate: {
        surfaceId: "x",
        path: "/",
        contents: [
          {
            key: "todo1",
            valueMap: { title: "Buy", done: false },
          },
        ],
      },
    });
    expect(validateA2uiJsonlLinesStrict(bad).ok).toBe(false);
  });

  it("accepts valueMap as an array of keyed rows", () => {
    const good = JSON.stringify({
      dataModelUpdate: {
        surfaceId: "x",
        path: "/",
        contents: [
          {
            key: "todo1",
            valueMap: [
              { key: "title", valueString: "Buy milk" },
              { key: "done", valueBoolean: false },
            ],
          },
        ],
      },
    });
    expect(validateA2uiJsonlLinesStrict(good).ok).toBe(true);
  });
});

describe("rewriteA2uiJsonlSurfaceIds", () => {
  it("rewrites surfaceId in each v0.8 message line (one top-level action per line)", () => {
    const line1 = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "model-main",
        components: [textComp("c", "x")],
      },
    });
    const line2 = JSON.stringify({
      dataModelUpdate: { surfaceId: "ignored", path: "/", contents: [] },
    });
    const out = rewriteA2uiJsonlSurfaceIds(`${line1}\n${line2}`, "a2ui-msg-1");
    const lines = out.split("\n").filter((l) => l.trim());
    const su = JSON.parse(lines[0]!) as {
      surfaceUpdate: { surfaceId: string };
    };
    const dm = JSON.parse(lines[1]!) as {
      dataModelUpdate: { surfaceId: string };
    };
    expect(su.surfaceUpdate.surfaceId).toBe("a2ui-msg-1");
    expect(dm.dataModelUpdate.surfaceId).toBe("a2ui-msg-1");
  });
});
