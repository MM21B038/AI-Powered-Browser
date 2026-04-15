/**
 * Polished “Advanced Todo List” A2UI v0.8 NDJSON for assistant markdown / JSONL pipelines.
 * Built as **typed objects + JSON.stringify** so NDJSON is always balanced (manual one-line JSON often adds an extra `}` after `Column` / `Row`, breaking `JSON.parse` at ~column 250).
 *
 * Strict v0.8 only:
 * - **`Card` is exactly `{ "child": "<component-id>" }`** — required; no `content` / `children` / bare `{}`.
 * - **`List` + `children.template`:** `dataBinding` is a **string** path to a `valueMap` list in the data model; each row uses `title` / `done` paths inside the template.
 * - **`Checkbox`:** `Checkbox` key; `label` + `value` only.
 * - **`Text`:** `{ text, usageHint? }` with closed enum for `usageHint`.
 *
 * Validated by {@link validateA2uiJsonlLinesStrict} in tests.
 */

const surfaceUpdate = {
  surfaceUpdate: {
    surfaceId: "main",
    components: [
      {
        id: "root",
        component: {
          Column: {
            children: {
              explicitList: [
                "headerCard",
                "sep1",
                "kpiRow",
                "sep2",
                "addCard",
                "sep3",
                "listCard",
                "sep4",
                "clearRow",
                "footerTxt",
              ],
            },
            distribution: "start",
            alignment: "stretch",
          },
        },
      },
      {
        id: "headerCard",
        component: { Card: { child: "headerInner" } },
      },
      {
        id: "headerInner",
        component: {
          Column: {
            children: { explicitList: ["brandRow"] },
            distribution: "start",
            alignment: "stretch",
          },
        },
      },
      {
        id: "brandRow",
        component: {
          Row: {
            children: { explicitList: ["appIcon", "titleStack"] },
            distribution: "start",
            alignment: "center",
          },
        },
      },
      {
        id: "appIcon",
        component: {
          Icon: { name: { literalString: "list" } },
        },
      },
      {
        id: "titleStack",
        component: {
          Column: {
            children: { explicitList: ["appTitle", "appSubtitle", "appHint"] },
            distribution: "start",
            alignment: "start",
          },
        },
      },
      {
        id: "appTitle",
        component: {
          Text: {
            text: { literalString: "Advanced Todo Workspace" },
            usageHint: "h2",
          },
        },
      },
      {
        id: "appSubtitle",
        component: {
          Text: {
            text: { literalString: "Template-driven list · strict v0.8 · NDJSON" },
            usageHint: "h4",
          },
        },
      },
      {
        id: "appHint",
        component: {
          Text: {
            text: {
              literalString:
                "Add toggles delete rows via actions; data lives in valueMap rows bound by path. Every Card must set child to a real component id.",
            },
            usageHint: "caption",
          },
        },
      },
      {
        id: "sep1",
        component: { Divider: { axis: "horizontal" } },
      },
      {
        id: "kpiRow",
        component: {
          Row: {
            children: { explicitList: ["k1", "k2", "k3"] },
            distribution: "spaceEvenly",
            alignment: "center",
          },
        },
      },
      {
        id: "k1",
        component: {
          Text: {
            text: { literalString: "· Dynamic List template" },
            usageHint: "caption",
          },
        },
      },
      {
        id: "k2",
        component: {
          Text: {
            text: { literalString: "· Card.child required" },
            usageHint: "caption",
          },
        },
      },
      {
        id: "k3",
        component: {
          Text: {
            text: { literalString: "· Path-bound rows" },
            usageHint: "caption",
          },
        },
      },
      {
        id: "sep2",
        component: { Divider: { axis: "horizontal" } },
      },
      {
        id: "addCard",
        component: { Card: { child: "addInner" } },
      },
      {
        id: "addInner",
        component: {
          Column: {
            children: { explicitList: ["addSectionTitle", "addRow"] },
            distribution: "start",
            alignment: "stretch",
          },
        },
      },
      {
        id: "addSectionTitle",
        component: {
          Text: {
            text: { literalString: "Quick add" },
            usageHint: "h4",
          },
        },
      },
      {
        id: "addRow",
        component: {
          Row: {
            children: { explicitList: ["fldNewTask", "btnAdd"] },
            distribution: "spaceBetween",
            alignment: "center",
          },
        },
      },
      {
        id: "fldNewTask",
        component: {
          TextField: {
            label: { literalString: "New task" },
            text: { path: "newTodo" },
            textFieldType: "shortText",
          },
        },
      },
      {
        id: "btnAdd",
        component: {
          Button: {
            child: "btnAddLbl",
            primary: true,
            action: { name: "addTodo" },
          },
        },
      },
      {
        id: "btnAddLbl",
        component: {
          Text: { text: { literalString: "Add" }, usageHint: "body" },
        },
      },
      {
        id: "sep3",
        component: { Divider: { axis: "horizontal" } },
      },
      {
        id: "listCard",
        component: { Card: { child: "listInner" } },
      },
      {
        id: "listInner",
        component: {
          Column: {
            children: { explicitList: ["listHeaderRow", "todoList"] },
            distribution: "start",
            alignment: "stretch",
          },
        },
      },
      {
        id: "listHeaderRow",
        component: {
          Row: {
            children: { explicitList: ["listHeading", "listBadge"] },
            distribution: "spaceBetween",
            alignment: "center",
          },
        },
      },
      {
        id: "listHeading",
        component: {
          Text: {
            text: { literalString: "Tasks" },
            usageHint: "h3",
          },
        },
      },
      {
        id: "listBadge",
        component: {
          Text: {
            text: { path: "taskBadge" },
            usageHint: "caption",
          },
        },
      },
      {
        id: "todoList",
        component: {
          List: {
            children: {
              template: {
                componentId: "todoRow",
                dataBinding: "todos",
              },
            },
            direction: "vertical",
            alignment: "stretch",
          },
        },
      },
      {
        id: "todoRow",
        component: {
          Row: {
            children: { explicitList: ["todoCheck", "todoTitle", "todoDelete"] },
            distribution: "spaceBetween",
            alignment: "center",
          },
        },
      },
      {
        id: "todoCheck",
        component: {
          Checkbox: {
            label: { literalString: "" },
            value: { path: "done" },
          },
        },
      },
      {
        id: "todoTitle",
        component: {
          Text: {
            text: { path: "title" },
            usageHint: "body",
          },
        },
      },
      {
        id: "todoDelete",
        component: {
          Button: {
            child: "todoDeleteLbl",
            action: { name: "deleteTodoItem" },
          },
        },
      },
      {
        id: "todoDeleteLbl",
        component: {
          Text: { text: { literalString: "✕" }, usageHint: "body" },
        },
      },
      {
        id: "sep4",
        component: { Divider: { axis: "horizontal" } },
      },
      {
        id: "clearRow",
        component: {
          Row: {
            children: { explicitList: ["btnClear"] },
            distribution: "start",
            alignment: "center",
          },
        },
      },
      {
        id: "btnClear",
        component: {
          Button: {
            child: "btnClearLbl",
            action: { name: "clearCompleted" },
          },
        },
      },
      {
        id: "btnClearLbl",
        component: {
          Text: { text: { literalString: "Clear completed" }, usageHint: "body" },
        },
      },
      {
        id: "footerTxt",
        component: {
          Text: {
            text: {
              literalString:
                "Host handlers: addTodo reads newTodo and appends a todos row; deleteTodoItem removes the keyed row; clearCompleted drops rows where done is true. Output one JSON object per line — avoid hand-merging a giant single line (brace errors break parse).",
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
    surfaceId: "main",
    path: "/",
    contents: [
      { key: "newTodo", valueString: "" },
      { key: "taskBadge", valueString: "3 tasks · template list" },
      {
        key: "todos",
        valueMap: [
          {
            key: "row1",
            valueMap: [
              { key: "title", valueString: "Wire Card.child on every Card surface" },
              { key: "done", valueBoolean: false },
            ],
          },
          {
            key: "row2",
            valueMap: [
              { key: "title", valueString: "Use List + template + string dataBinding" },
              { key: "done", valueBoolean: true },
            ],
          },
          {
            key: "row3",
            valueMap: [
              { key: "title", valueString: "Ship NDJSON lines + beginRendering last" },
              { key: "done", valueBoolean: false },
            ],
          },
        ],
      },
    ],
  },
};

const beginRendering = {
  beginRendering: {
    surfaceId: "main",
    root: "root",
    styles: {
      primaryColor: "#1565c0",
      font: "system-ui, -apple-system, Segoe UI, sans-serif",
    },
  },
};

/** Three-line NDJSON: surfaceUpdate → dataModelUpdate → beginRendering */
export const ADVANCED_TODO_LIST_A2UI_JSONL = [
  JSON.stringify(surfaceUpdate),
  JSON.stringify(dataModelUpdate),
  JSON.stringify(beginRendering),
].join("\n");
