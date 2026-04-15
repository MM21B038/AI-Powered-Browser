/**
 * Minimal v0.8 NDJSON demonstrating **host-local** interactivity without an LLM:
 * - `host.patch.v1` + JSON `contents` string (v0.8 `Button.action.context` is an array of primitives).
 * - `host.openUrl` with `context.url`.
 *
 * Validated by {@link validateA2uiJsonlLinesStrict} in tests.
 */

const surfaceUpdate = {
  surfaceUpdate: {
    surfaceId: "hostLocal",
    components: [
      {
        id: "root",
        component: {
          Column: {
            children: {
              explicitList: ["hdr", "statusLine", "actionRow", "hintTxt"],
            },
            distribution: "start",
            alignment: "stretch",
          },
        },
      },
      {
        id: "hdr",
        component: {
          Text: {
            text: { literalString: "Host-local demo" },
            usageHint: "h3",
          },
        },
      },
      {
        id: "statusLine",
        component: {
          Text: {
            text: { path: "demoStatus" },
            usageHint: "body",
          },
        },
      },
      {
        id: "actionRow",
        component: {
          Row: {
            children: { explicitList: ["btnLive", "btnDocs"] },
            distribution: "start",
            alignment: "center",
          },
        },
      },
      {
        id: "btnLive",
        component: {
          Button: {
            child: "btnLiveLbl",
            primary: true,
            action: {
              name: "host.patch.v1",
              context: [
                {
                  key: "patchKind",
                  value: { literalString: "dataModelUpdate" },
                },
                { key: "path", value: { literalString: "/" } },
                {
                  key: "contents",
                  value: {
                    literalString:
                      '[{"key":"demoStatus","valueString":"Live (local patch)"}]',
                  },
                },
              ],
            },
          },
        },
      },
      {
        id: "btnLiveLbl",
        component: {
          Text: { text: { literalString: "Set status (local)" }, usageHint: "body" },
        },
      },
      {
        id: "btnDocs",
        component: {
          Button: {
            child: "btnDocsLbl",
            action: {
              name: "host.openUrl",
              context: [
                {
                  key: "url",
                  value: { literalString: "https://a2ui.org" },
                },
              ],
            },
          },
        },
      },
      {
        id: "btnDocsLbl",
        component: {
          Text: { text: { literalString: "A2UI docs (browser)" }, usageHint: "body" },
        },
      },
      {
        id: "hintTxt",
        component: {
          Text: {
            text: {
              literalString:
                "Uses host.patch.v1 and host.openUrl — no assistant round-trip for these controls.",
            },
            usageHint: "caption",
          },
        },
      },
    ],
  },
};

const dataModelUpdate = {
  dataModelUpdate: {
    surfaceId: "hostLocal",
    path: "/",
    contents: [{ key: "demoStatus", valueString: "Ready" }],
  },
};

const beginRendering = {
  beginRendering: {
    surfaceId: "hostLocal",
    root: "root",
    styles: {
      primaryColor: "#1565c0",
      font: "system-ui, sans-serif",
    },
  },
};

/** Three-line NDJSON validated against v0.8. */
export const HOST_LOCAL_DEMO_A2UI_JSONL = [
  JSON.stringify(surfaceUpdate),
  JSON.stringify(dataModelUpdate),
  JSON.stringify(beginRendering),
].join("\n");
