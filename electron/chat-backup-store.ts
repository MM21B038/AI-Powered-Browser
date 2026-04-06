/**
 * Full chat JSON backup under userData when renderer localStorage quota is exceeded.
 */
import fs from "node:fs/promises";
import path from "node:path";

const REL_DIR = "chat-backup";
const FILE = "conversations-v2.json";

export function chatBackupFilePath(userDataPath: string): string {
  return path.join(userDataPath, REL_DIR, FILE);
}

export async function writeChatStateBackup(
  userDataPath: string,
  json: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const p = chatBackupFilePath(userDataPath);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, json, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function readChatStateBackup(userDataPath: string): Promise<string | null> {
  try {
    const p = chatBackupFilePath(userDataPath);
    const buf = await fs.readFile(p, "utf8");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}
