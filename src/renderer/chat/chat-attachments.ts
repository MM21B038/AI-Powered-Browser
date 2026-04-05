/**
 * Composer file attachments: limits, validation, and sandbox filename mapping.
 */

import type { ChatAttachment } from "./conversation-store";

export const CHAT_ATTACHMENT_LIMITS = {
  maxFiles: 12,
  /** Per file (composer + sandbox injection). */
  maxBytesPerFile: 50 * 1024 * 1024,
  /** Cap for one send batch (localStorage + IPC). */
  maxTotalBytes: 200 * 1024 * 1024,
} as const;

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Short copy for UI (composer hint, tooltips). */
export function chatAttachmentLimitsSummary(): string {
  return `${formatMb(CHAT_ATTACHMENT_LIMITS.maxBytesPerFile)} max per file · ${formatMb(
    CHAT_ATTACHMENT_LIMITS.maxTotalBytes,
  )} max total · up to ${CHAT_ATTACHMENT_LIMITS.maxFiles} files`;
}

export async function fileToChatAttachment(file: File): Promise<ChatAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  const dataBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  return {
    id,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    dataBase64,
  };
}

export function validateChatAttachmentList(att: ChatAttachment[]): string | null {
  if (att.length > CHAT_ATTACHMENT_LIMITS.maxFiles) {
    return `You can attach at most ${CHAT_ATTACHMENT_LIMITS.maxFiles} files.`;
  }
  let total = 0;
  for (const a of att) {
    if (a.size > CHAT_ATTACHMENT_LIMITS.maxBytesPerFile) {
      return `“${a.name}” exceeds the per-file limit (${formatMb(
        CHAT_ATTACHMENT_LIMITS.maxBytesPerFile,
      )} max).`;
    }
    total += a.size;
  }
  if (total > CHAT_ATTACHMENT_LIMITS.maxTotalBytes) {
    return `Total attachments exceed ${formatMb(CHAT_ATTACHMENT_LIMITS.maxTotalBytes)} (batch limit). Remove some files or send in smaller batches.`;
  }
  return null;
}

function sandboxBasename(raw: string): string {
  const base = raw.replace(/^.*[/\\]/, "").replace(/[^\w.\- ()[\]]+/g, "_");
  const t = base.trim().slice(0, 180);
  return t.length > 0 ? t : "file.bin";
}

/** Map chat attachments to sandbox filenames (dedupe) for intelligent_python_execute. */
/** Short line for the model: sandbox filenames for Python. */
export function attachmentInstructionText(att: ChatAttachment[]): string {
  const names = chatAttachmentsToSandboxInputFiles(att).map((f) => f.name);
  return `Attached files are available in the Python sandbox when you call intelligent_python_execute (same working directory as the script). Use these exact filenames: ${names.map((n) => `"${n}"`).join(", ")}.`;
}

export function chatAttachmentsToSandboxInputFiles(
  att: ChatAttachment[],
): Array<{ name: string; dataBase64: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; dataBase64: string }> = [];
  for (const a of att) {
    let name = sandboxBasename(a.name);
    if (seen.has(name)) {
      const dot = name.lastIndexOf(".");
      let stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let n = 2;
      while (seen.has(name)) {
        name = `${stem}_${n}${ext}`;
        n++;
      }
    }
    seen.add(name);
    out.push({ name, dataBase64: a.dataBase64 });
  }
  return out;
}
