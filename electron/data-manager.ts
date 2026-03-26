import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export class DataManager {
  dataDir = path.join(os.homedir(), ".autonomous-browser", "data");
  bookmarksFile = path.join(this.dataDir, "bookmarks.json");
  historyFile = path.join(this.dataDir, "history.json");
  cookiesFile = path.join(this.dataDir, "cookies.json");
  passwordsFile = path.join(this.dataDir, "passwords.json");
  autofillFile = path.join(this.dataDir, "autofill.json");
  metadataFile = path.join(this.dataDir, "metadata.json");
  version = "1.0.0";

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await Promise.all([
      this.ensure(this.bookmarksFile, { version: this.version, bookmarks: [], folders: [] }),
      this.ensure(this.historyFile, { version: this.version, history: [] }),
      this.ensure(this.cookiesFile, { version: this.version, cookies: [] }),
      this.ensure(this.passwordsFile, { version: this.version, passwords: [] }),
      this.ensure(this.autofillFile, { version: this.version, autofill: [] }),
      this.ensure(this.metadataFile, { version: this.version, imports: [], lastBackup: null }),
    ]);
  }

  private async ensure(filePath: string, defaultData: unknown): Promise<void> {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2), "utf8");
    }
  }

  private async read<T>(filePath: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  private async write(filePath: string, data: unknown): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  getBookmarks() {
    return this.read(this.bookmarksFile, { version: this.version, bookmarks: [], folders: [] });
  }

  saveBookmarks(data: unknown) {
    return this.write(this.bookmarksFile, data);
  }

  async addBookmark(bookmark: { title: string; url: string; folder?: string; source?: string }) {
    const data = await this.getBookmarks();
    const entry = {
      id: Date.now().toString(),
      title: bookmark.title,
      url: bookmark.url,
      folder: bookmark.folder || "Bookmarks bar",
      dateAdded: Date.now(),
      source: bookmark.source || "manual",
    };
    (data.bookmarks as unknown[]).push(entry);
    await this.saveBookmarks(data);
    return entry;
  }

  getHistory() {
    return this.read(this.historyFile, { version: this.version, history: [] });
  }

  saveHistory(data: unknown) {
    return this.write(this.historyFile, data);
  }

  async addHistoryEntry(entry: { url: string; title?: string; source?: string }) {
    const data = await this.getHistory();
    const existing = (data.history as any[]).find((h) => h.url === entry.url);
    if (existing) {
      existing.visitCount += 1;
      existing.lastVisitTime = Date.now();
      existing.title = entry.title || existing.title;
    } else {
      (data.history as any[]).push({
        id: Date.now().toString(),
        url: entry.url,
        title: entry.title,
        visitCount: 1,
        lastVisitTime: Date.now(),
        firstVisitTime: Date.now(),
        source: entry.source || "manual",
      });
    }
    await this.saveHistory(data);
  }

  getCookies() {
    return this.read(this.cookiesFile, { version: this.version, cookies: [] });
  }
  saveCookies(data: unknown) {
    return this.write(this.cookiesFile, data);
  }
  async addCookies(cookies: any[]) {
    const data = await this.getCookies();
    for (const cookie of cookies) {
      const idx = (data.cookies as any[]).findIndex(
        (c) => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path,
      );
      if (idx >= 0) Object.assign((data.cookies as any[])[idx], cookie);
      else (data.cookies as any[]).push({ ...cookie, id: `${Date.now()}${Math.random()}` });
    }
    await this.saveCookies(data);
  }

  getPasswords() {
    return this.read(this.passwordsFile, { version: this.version, passwords: [] });
  }
  savePasswords(data: unknown) {
    return this.write(this.passwordsFile, data);
  }
  async addPasswords(passwords: any[]) {
    const data = await this.getPasswords();
    for (const pw of passwords) {
      const idx = (data.passwords as any[]).findIndex((p) => p.url === pw.url && p.username === pw.username);
      if (idx >= 0) Object.assign((data.passwords as any[])[idx], pw);
      else (data.passwords as any[]).push({ ...pw, id: `${Date.now()}${Math.random()}` });
    }
    await this.savePasswords(data);
  }

  getAutofill() {
    return this.read(this.autofillFile, { version: this.version, autofill: [] });
  }
  saveAutofill(data: unknown) {
    return this.write(this.autofillFile, data);
  }
  async addAutofill(entries: any[]) {
    const data = await this.getAutofill();
    for (const entry of entries) {
      (data.autofill as any[]).push({ ...entry, id: `${Date.now()}${Math.random()}` });
    }
    await this.saveAutofill(data);
  }

  getMetadata() {
    return this.read(this.metadataFile, { version: this.version, imports: [], lastBackup: null });
  }
  saveMetadata(data: unknown) {
    return this.write(this.metadataFile, data);
  }
  async recordImport(browser: string, dataTypes: string[], count: number) {
    const meta = await this.getMetadata();
    (meta.imports as any[]).push({ id: Date.now().toString(), browser, dataTypes, count, timestamp: Date.now() });
    await this.saveMetadata(meta);
  }

  async getStats() {
    const [bm, hist, ck, pw, af] = await Promise.all([
      this.getBookmarks(),
      this.getHistory(),
      this.getCookies(),
      this.getPasswords(),
      this.getAutofill(),
    ]);
    return {
      bookmarks: (bm.bookmarks as any[]).length,
      history: (hist.history as any[]).length,
      cookies: (ck.cookies as any[]).length,
      passwords: (pw.passwords as any[]).length,
      autofill: (af.autofill as any[]).length,
      lastImport: ((await this.getMetadata()).imports as any[]).slice(-1)[0] || null,
    };
  }

  async clearAllData() {
    const files = [
      this.bookmarksFile,
      this.historyFile,
      this.cookiesFile,
      this.passwordsFile,
      this.autofillFile,
      this.metadataFile,
    ];
    await Promise.allSettled(files.map((f) => fs.unlink(f)));
    await this.initialize();
  }
}
