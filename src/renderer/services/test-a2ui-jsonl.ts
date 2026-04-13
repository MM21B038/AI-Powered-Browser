import { describe, expect, it } from "vitest";
import { validateA2uiJsonlLinesStrict } from "../../shared/a2ui-strict-validate";
import {
  coerceLlmShortcutsInA2uiJsonl,
  collectA2uiJsonlFromToolMessages,
  ensureBeginRenderingForJsonl,
  mergeA2uiJsonlParts,
  normalizeAlternateA2uiShape,
  orderA2uiJsonlServerMessages,
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

describe("validateIntelligentA2uiSubmitJsonl", () => {
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

  it("rejects invalid lines", () => {
    const v = validateIntelligentA2uiSubmitJsonl("{ not json");
    expect(v.ok).toBe(false);
  });
});

describe("collectA2uiJsonlFromToolMessages", () => {
  it("collects jsonl from intelligent_a2ui_submit tool messages", () => {
    const line = JSON.stringify({
      surfaceUpdate: {
        surfaceId: "s",
        components: [textComp("t", "ok")],
      },
    });
    const merged = collectA2uiJsonlFromToolMessages([
      {
        role: "tool",
        name: "intelligent_a2ui_submit",
        arguments: JSON.stringify({ jsonl: line }),
      },
    ]);
    expect(merged).toBeDefined();
    expect(merged!).toContain("surfaceUpdate");
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
