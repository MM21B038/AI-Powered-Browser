const fs = require("fs").promises;
const path = require("path");
const os = require("os");

class DataManager {
  constructor() {
    this.dataDir       = path.join(os.homedir(), ".autonomous-browser", "data");
    this.bookmarksFile = path.join(this.dataDir, "bookmarks.json");
    this.historyFile   = path.join(this.dataDir, "history.json");
    this.cookiesFile   = path.join(this.dataDir, "cookies.json");
    this.passwordsFile = path.join(this.dataDir, "passwords.json");
    this.autofillFile  = path.join(this.dataDir, "autofill.json");
    this.metadataFile  = path.join(this.dataDir, "metadata.json");
    this.version       = "1.0.0";
  }

  async initialize() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await Promise.all([
      this._ensure(this.bookmarksFile, { version: this.version, bookmarks: [], folders: [] }),
      this._ensure(this.historyFile,   { version: this.version, history: [] }),
      this._ensure(this.cookiesFile,   { version: this.version, cookies: [] }),
      this._ensure(this.passwordsFile, { version: this.version, passwords: [] }),
      this._ensure(this.autofillFile,  { version: this.version, autofill: [] }),
      this._ensure(this.metadataFile,  { version: this.version, imports: [], lastBackup: null }),
    ]);
  }

  async _ensure(filePath, defaultData) {
    try { await fs.access(filePath); }
    catch { await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2)); }
  }

  async _read(filePath, fallback) {
    try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
    catch { return fallback; }
  }

  async _write(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    this._backup(filePath).catch(() => {});
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  getBookmarks()          { return this._read(this.bookmarksFile, { version: this.version, bookmarks: [], folders: [] }); }
  saveBookmarks(data)     { return this._write(this.bookmarksFile, data); }

  async addBookmark(bookmark) {
    const data = await this.getBookmarks();
    const entry = { id: Date.now().toString(), title: bookmark.title, url: bookmark.url, folder: bookmark.folder || "Bookmarks bar", dateAdded: Date.now(), source: bookmark.source || "manual" };
    data.bookmarks.push(entry);
    await this.saveBookmarks(data);
    return entry;
  }

  // ── History ────────────────────────────────────────────────────────────────

  getHistory()        { return this._read(this.historyFile, { version: this.version, history: [] }); }
  saveHistory(data)   { return this._write(this.historyFile, data); }

  async addHistoryEntry(entry) {
    const data = await this.getHistory();
    const existing = data.history.find(h => h.url === entry.url);
    if (existing) {
      existing.visitCount++;
      existing.lastVisitTime = Date.now();
      existing.title = entry.title || existing.title;
    } else {
      data.history.push({ id: Date.now().toString(), url: entry.url, title: entry.title, visitCount: 1, lastVisitTime: Date.now(), firstVisitTime: Date.now(), source: entry.source || "manual" });
    }
    await this.saveHistory(data);
  }

  // ── Cookies ────────────────────────────────────────────────────────────────

  getCookies()        { return this._read(this.cookiesFile, { version: this.version, cookies: [] }); }
  saveCookies(data)   { return this._write(this.cookiesFile, data); }

  async addCookies(cookies) {
    const data = await this.getCookies();
    for (const cookie of cookies) {
      const idx = data.cookies.findIndex(c => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path);
      if (idx >= 0) Object.assign(data.cookies[idx], cookie);
      else data.cookies.push({ ...cookie, id: Date.now().toString() + Math.random() });
    }
    await this.saveCookies(data);
  }

  // ── Passwords ──────────────────────────────────────────────────────────────

  getPasswords()        { return this._read(this.passwordsFile, { version: this.version, passwords: [] }); }
  savePasswords(data)   { return this._write(this.passwordsFile, data); }

  async addPasswords(passwords) {
    const data = await this.getPasswords();
    for (const pw of passwords) {
      const idx = data.passwords.findIndex(p => p.url === pw.url && p.username === pw.username);
      if (idx >= 0) Object.assign(data.passwords[idx], pw);
      else data.passwords.push({ ...pw, id: Date.now().toString() + Math.random() });
    }
    await this.savePasswords(data);
  }

  // ── Autofill ───────────────────────────────────────────────────────────────

  getAutofill()        { return this._read(this.autofillFile, { version: this.version, autofill: [] }); }
  saveAutofill(data)   { return this._write(this.autofillFile, data); }

  async addAutofill(entries) {
    const data = await this.getAutofill();
    for (const entry of entries) {
      if (entry.type === "formField") {
        const idx = data.autofill.findIndex(a => a.type === "formField" && a.name === entry.name && a.value === entry.value);
        if (idx >= 0) { data.autofill[idx].count = Math.max(data.autofill[idx].count, entry.count); }
        else data.autofill.push({ ...entry, id: Date.now().toString() + Math.random() });
      } else if (entry.type === "address") {
        const idx = data.autofill.findIndex(a => a.type === "address" && a.guid === entry.guid);
        if (idx >= 0) Object.assign(data.autofill[idx], entry);
        else data.autofill.push({ ...entry, id: Date.now().toString() + Math.random() });
      } else if (entry.type === "creditCard") {
        const idx = data.autofill.findIndex(a => a.type === "creditCard" && a.guid === entry.guid);
        if (idx >= 0) Object.assign(data.autofill[idx], entry);
        else data.autofill.push({ ...entry, id: Date.now().toString() + Math.random() });
      }
    }
    await this.saveAutofill(data);
  }

  // ── Metadata ───────────────────────────────────────────────────────────────

  getMetadata()        { return this._read(this.metadataFile, { version: this.version, imports: [], lastBackup: null }); }
  saveMetadata(data)   { return this._write(this.metadataFile, data); }

  async recordImport(browser, dataTypes, count) {
    const meta = await this.getMetadata();
    meta.imports.push({ id: Date.now().toString(), browser, dataTypes, count, timestamp: Date.now() });
    await this.saveMetadata(meta);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats() {
    const [bm, hist, ck, pw, af] = await Promise.all([
      this.getBookmarks(), this.getHistory(), this.getCookies(), this.getPasswords(), this.getAutofill(),
    ]);
    return {
      bookmarks: bm.bookmarks.length,
      history:   hist.history.length,
      cookies:   ck.cookies.length,
      passwords: pw.passwords.length,
      autofill:  af.autofill.length,
      lastImport: (await this.getMetadata()).imports.slice(-1)[0] || null,
    };
  }

  // ── Clear ──────────────────────────────────────────────────────────────────

  async clearAllData() {
    const files = [this.bookmarksFile, this.historyFile, this.cookiesFile, this.passwordsFile, this.autofillFile, this.metadataFile];
    await Promise.allSettled(files.map(f => fs.unlink(f)));
    await this.initialize();
  }

  // ── Backup ─────────────────────────────────────────────────────────────────

  async _backup(filePath) {
    const backupDir = path.join(this.dataDir, "backups");
    await fs.mkdir(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(backupDir, `${path.basename(filePath)}.${ts}.bak`);
    await fs.copyFile(filePath, dest);
    // Keep last 7 backups per file
    const base = path.basename(filePath);
    const all = (await fs.readdir(backupDir)).filter(f => f.startsWith(base) && f.endsWith(".bak")).sort().reverse();
    for (const old of all.slice(7)) await fs.unlink(path.join(backupDir, old)).catch(() => {});
  }
}

module.exports = DataManager;
