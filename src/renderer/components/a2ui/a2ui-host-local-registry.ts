import type { ServerToClientMessage } from "@a2ui/react/v0_8";
import type { A2uiUserActionPayload } from "../../../shared/format-a2ui-user-action";

export type HostA2uiProcessorApi = {
  processMessages: (messages: ServerToClientMessage[]) => void;
  getSurface: (surfaceId: string) => unknown;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function readStringFromAny(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (!isRecord(v)) return null;
  if (typeof v.valueString === "string") return v.valueString;
  if (typeof v.literalString === "string") return v.literalString;
  return null;
}

function readNumberFromAny(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (!isRecord(v)) return null;
  if (typeof v.valueNumber === "number") return v.valueNumber;
  if (typeof v.literalNumber === "number") return v.literalNumber;
  return null;
}

function readBooleanFromAny(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (!isRecord(v)) return null;
  if (typeof v.valueBoolean === "boolean") return v.valueBoolean;
  if (typeof v.literalBoolean === "boolean") return v.literalBoolean;
  return null;
}

function getDataModel(surface: unknown): Record<string, unknown> | null {
  if (!isRecord(surface)) return null;
  const dm = surface.dataModel;
  return isRecord(dm) ? dm : null;
}

function writeDataModelUpdate(
  api: HostA2uiProcessorApi,
  surfaceId: string,
  contents: unknown[],
  path = "/",
): void {
  api.processMessages([
    {
      dataModelUpdate: {
        surfaceId,
        path,
        contents,
      },
    } as unknown as ServerToClientMessage,
  ]);
}

/**
 * Host-local interaction registry: intercept known action names and update the panel immediately
 * (no model round-trip). Return true when handled.
 *
 * Supported names:
 * - `addTask`: demo todo behavior (draftTitle/newTask + tasks list)
 * - `host.dm.set`: set a single data-model key (context: { key|path, valueString|valueNumber|valueBoolean|value })
 * - `host.dm.toggle`: toggle a boolean key (context: { key|path })
 */
export function handleHostLocalA2uiAction(
  ua: A2uiUserActionPayload,
  api: HostA2uiProcessorApi | null,
  notify: (msg: string, durationMs?: number) => void,
): boolean {
  if (!api) return false;

  if (ua.name === "addTask" || ua.name === "addTodo") {
    const surface = api.getSurface(ua.surfaceId);
    const dm = getDataModel(surface);
    const draftKey =
      (dm && readStringFromAny(dm.draftTitle)?.trim())
        ? "draftTitle"
        : (dm && readStringFromAny(dm.newTodo)?.trim())
          ? "newTodo"
          : "newTask";
    const title = (dm ? readStringFromAny(dm[draftKey]) : null)?.trim() ?? "";
    if (!title) {
      notify("Type a task title first", 2600);
      return true;
    }

    const tasks: Array<{ title: string }> = [];
    if (dm && isRecord(dm.tasks)) {
      const t = dm.tasks as Record<string, unknown>;
      const keys = Object.keys(t).sort((a, b) => Number(a) - Number(b));
      for (const k of keys) {
        const item = t[k];
        if (!isRecord(item)) continue;
        const tt = readStringFromAny(item.title);
        if (tt && tt.trim()) tasks.push({ title: tt.trim() });
      }
    }
    if (tasks.length > 0) {
      // Dynamic-list model
      tasks.push({ title });
      writeDataModelUpdate(api, ua.surfaceId, [
        { key: draftKey, valueString: "" },
        {
          key: "tasks",
          valueMap: tasks.map((t, idx) => ({
            key: String(idx),
            valueMap: [{ key: "title", valueString: t.title }],
          })),
        },
      ]);
      notify("Added task", 2200);
      return true;
    }

    // Simple 2-row demo model (todo0_title/todo1_title)
    const t0 = dm ? readStringFromAny(dm.todo0_title)?.trim() ?? "" : "";
    const t1 = dm ? readStringFromAny(dm.todo1_title)?.trim() ?? "" : "";
    const fillKey = !t0 ? "todo0_title" : !t1 ? "todo1_title" : null;
    if (!fillKey) {
      notify("List is full (demo only)", 2800);
      return true;
    }
    writeDataModelUpdate(api, ua.surfaceId, [
      { key: draftKey, valueString: "" },
      { key: fillKey, valueString: title },
    ]);
    notify("Added task", 2200);
    return true;
  }

  if (ua.name === "deleteTodo0" || ua.name === "deleteTodo1") {
    const key = ua.name === "deleteTodo0" ? "todo0_title" : "todo1_title";
    writeDataModelUpdate(api, ua.surfaceId, [{ key, valueString: "" }]);
    notify("Deleted", 1800);
    return true;
  }

  if (ua.name === "host.dm.set") {
    const ctx = ua.context;
    if (!isRecord(ctx)) return false;
    const kRaw = (typeof ctx.path === "string" ? ctx.path : typeof ctx.key === "string" ? ctx.key : "").trim();
    const key = kRaw.startsWith("/") ? kRaw.slice(1) : kRaw;
    if (!key) return false;

    const vAny = "value" in ctx ? (ctx as { value?: unknown }).value : undefined;
    const vs =
      readStringFromAny((ctx as { valueString?: unknown }).valueString) ??
      readStringFromAny(vAny);
    if (vs !== null) {
      writeDataModelUpdate(api, ua.surfaceId, [{ key, valueString: vs }]);
      return true;
    }
    const vn =
      readNumberFromAny((ctx as { valueNumber?: unknown }).valueNumber) ??
      readNumberFromAny(vAny);
    if (vn !== null) {
      writeDataModelUpdate(api, ua.surfaceId, [{ key, valueNumber: vn }]);
      return true;
    }
    const vb =
      readBooleanFromAny((ctx as { valueBoolean?: unknown }).valueBoolean) ??
      readBooleanFromAny(vAny);
    if (vb !== null) {
      writeDataModelUpdate(api, ua.surfaceId, [{ key, valueBoolean: vb }]);
      return true;
    }
    return false;
  }

  if (ua.name === "host.dm.toggle") {
    const ctx = ua.context;
    if (!isRecord(ctx)) return false;
    const kRaw = (typeof ctx.path === "string" ? ctx.path : typeof ctx.key === "string" ? ctx.key : "").trim();
    const key = kRaw.startsWith("/") ? kRaw.slice(1) : kRaw;
    if (!key) return false;
    const surface = api.getSurface(ua.surfaceId);
    const dm = getDataModel(surface);
    const current = dm ? readBooleanFromAny(dm[key]) : null;
    const next = !(current ?? false);
    writeDataModelUpdate(api, ua.surfaceId, [{ key, valueBoolean: next }]);
    return true;
  }

  return false;
}

