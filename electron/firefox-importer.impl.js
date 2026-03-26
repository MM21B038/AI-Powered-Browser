const fs = require("fs").promises;
const fss = require("fs");
const path = require("path");
const os = require("os");
const Database = require("sqlite3").verbose();

class FirefoxImporter {
  constructor() {
    this.profilesBase = this._getProfilesBase();
  }

  _getProfilesBase() {
    const home = os.homedir();
    if (process.platform === "win32")
      return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Mozilla", "Firefox", "Profiles");
    if (process.platform === "darwin")
      return path.join(home, "Library", "Application Support", "Firefox", "Profiles");
    return path.join(home, ".mozilla", "firefox");
  }

  async findAllProfiles() {
    try {
      const entries = await fs.readdir(this.profilesBase);
      const profiles = [];
      for (const entry of entries) {
        const full = path.join(this.profilesBase, entry);
        try {
          const stat = await fs.stat(full);
          if (!stat.isDirectory()) continue;
          await fs.access(path.join(full, "places.sqlite"));
          profiles.push({ name: entry, path: full });
        } catch { /* skip */ }
      }
      profiles.sort((a, b) => {
        const score = (n) =>
          n.includes("default-release") ? 0 : n.includes("default") && !n.includes("Profile") ? 1 : 2;
        return score(a.name) - score(b.name) || a.name.localeCompare(b.name);
      });
      return profiles;
    } catch {
      return [];
    }
  }

  async getDefaultProfile() {
    const profiles = await this.findAllProfiles();
    return profiles[0] || null;
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  async importBookmarks(profilePath) {
    const p = profilePath || (await this.getDefaultProfile())?.path;
    if (!p) throw new Error("Firefox profile not found");

    const tmp = await this._copyToTemp(path.join(p, "places.sqlite"), "ff_places");
    const [folders, bookmarks] = await Promise.all([
      this._queryDb(tmp, `
        SELECT id, title, parent FROM moz_bookmarks
        WHERE type = 2 AND parent != 0 ORDER BY parent, position
      `, r => ({ id: r.id.toString(), name: r.title || "Unnamed", parent: r.parent.toString(), dateAdded: Date.now() })),
      this._queryDb(tmp, `
        SELECT b.id, b.title, p.url, b.parent, b.dateAdded
        FROM moz_bookmarks b JOIN moz_places p ON b.fk = p.id
        WHERE b.type = 1 AND b.fk IS NOT NULL
        ORDER BY b.parent, b.position
      `, r => ({ id: r.id.toString(), title: r.title || "", url: r.url, folder: r.parent.toString(), dateAdded: this._toUnix(r.dateAdded), source: "firefox" })),
    ]);
    await fs.unlink(tmp).catch(() => {});
    return { bookmarks, folders };
  }

  // ── History ────────────────────────────────────────────────────────────────

  async importHistory(profilePath) {
    const p = profilePath || (await this.getDefaultProfile())?.path;
    if (!p) throw new Error("Firefox profile not found");

    const placesPath = path.join(p, "places.sqlite");
    await fs.access(placesPath);
    const tmp = await this._copyToTemp(placesPath, "ff_hist");

    const rows = await this._queryDb(tmp, `
      SELECT url, title, visit_count, last_visit_date, frecency
      FROM moz_places WHERE visit_count > 0
      ORDER BY last_visit_date DESC LIMIT 50000
    `, r => ({
      url: r.url,
      title: r.title || "",
      visitCount: r.visit_count,
      lastVisitTime: this._toUnix(r.last_visit_date),
      firstVisitTime: this._toUnix(r.last_visit_date),
      frecency: r.frecency,
      source: "firefox",
    }));
    await fs.unlink(tmp).catch(() => {});
    return rows;
  }

  // ── Cookies ────────────────────────────────────────────────────────────────

  async importCookies(profilePath) {
    const p = profilePath || (await this.getDefaultProfile())?.path;
    if (!p) throw new Error("Firefox profile not found");

    const cookiesPath = path.join(p, "cookies.sqlite");
    await fs.access(cookiesPath);
    const tmp = await this._copyToTemp(cookiesPath, "ff_cookies");

    const rows = await this._queryDb(tmp, `
      SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite
      FROM moz_cookies ORDER BY creationTime DESC
    `, r => ({
      domain: r.host,
      name: r.name,
      value: r.value,
      path: r.path,
      expires: r.expiry ? r.expiry * 1000 : null,
      secure: r.isSecure === 1,
      httpOnly: r.isHttpOnly === 1,
      sameSite: r.sameSite,
      source: "firefox",
    }));
    await fs.unlink(tmp).catch(() => {});
    return rows;
  }

  // ── Passwords ──────────────────────────────────────────────────────────────
  // Firefox stores passwords in logins.json (metadata) + key4.db (encryption keys).
  // We export the metadata; passwords are marked [encrypted] — full decryption
  // requires NSS/libnss3 which is outside scope.

  async importPasswords(profilePath) {
    const p = profilePath || (await this.getDefaultProfile())?.path;
    if (!p) throw new Error("Firefox profile not found");

    const loginsPath = path.join(p, "logins.json");
    try {
      await fs.access(loginsPath);
    } catch { return []; }

    const raw = await fs.readFile(loginsPath, "utf8");
    const data = JSON.parse(raw);
    return (data.logins || []).map(l => ({
      url: l.hostname,
      formSubmitUrl: l.formSubmitURL,
      usernameField: l.usernameField,
      username: l.encryptedUsername ? "[encrypted]" : "",
      passwordField: l.passwordField,
      password: "[encrypted — requires NSS decryption]",
      guid: l.guid,
      timeCreated: l.timeCreated,
      timeLastUsed: l.timeLastUsed,
      timePasswordChanged: l.timePasswordChanged,
      timesUsed: l.timesUsed,
      source: "firefox",
    }));
  }

  // ── Autofill ───────────────────────────────────────────────────────────────

  async importAutofill(profilePath) {
    const p = profilePath || (await this.getDefaultProfile())?.path;
    if (!p) throw new Error("Firefox profile not found");

    const results = [];

    // Form history (formhistory.sqlite)
    const formHistPath = path.join(p, "formhistory.sqlite");
    try {
      await fs.access(formHistPath);
      const tmp = await this._copyToTemp(formHistPath, "ff_form");
      const rows = await this._queryDb(tmp, `
        SELECT fieldname, value, timesUsed, firstUsed, lastUsed
        FROM moz_formhistory ORDER BY timesUsed DESC LIMIT 5000
      `, r => ({
        type: "formField",
        name: r.fieldname,
        value: r.value,
        count: r.timesUsed,
        dateCreated: r.firstUsed ? Math.floor(r.firstUsed / 1000) : Date.now(),
        dateLastUsed: r.lastUsed ? Math.floor(r.lastUsed / 1000) : Date.now(),
        source: "firefox",
      }));
      await fs.unlink(tmp).catch(() => {});
      results.push(...rows);
    } catch { /* no form history */ }

    // Addresses (autofill-profiles.json — Firefox 55+)
    const autofillPath = path.join(p, "autofill-profiles.json");
    try {
      await fs.access(autofillPath);
      const raw = await fs.readFile(autofillPath, "utf8");
      const data = JSON.parse(raw);
      const addresses = (data.addresses || []).map(a => ({
        type: "address",
        guid: a.guid,
        firstName: a["given-name"] || "",
        additionalName: a["additional-name"] || "",
        lastName: a["family-name"] || "",
        organization: a.organization || "",
        streetAddress: a["street-address"] || "",
        addressLevel2: a["address-level2"] || "",
        addressLevel1: a["address-level1"] || "",
        postalCode: a["postal-code"] || "",
        country: a.country || "",
        tel: a.tel || "",
        email: a.email || "",
        timeCreated: a.timeCreated,
        timeLastModified: a.timeLastModified,
        source: "firefox",
      }));
      results.push(...addresses);
    } catch { /* no autofill profiles */ }

    // Credit cards (autofill-profiles.json also contains creditCards in newer Firefox)
    try {
      const raw = await fs.readFile(autofillPath, "utf8");
      const data = JSON.parse(raw);
      const cards = (data.creditCards || []).map(c => ({
        type: "creditCard",
        guid: c.guid,
        nameOnCard: c["cc-name"] || "",
        expirationMonth: c["cc-exp-month"] || "",
        expirationYear: c["cc-exp-year"] || "",
        cardNumber: "[encrypted]",
        timeCreated: c.timeCreated,
        timeLastModified: c.timeLastModified,
        source: "firefox",
      }));
      results.push(...cards);
    } catch { /* no credit cards */ }

    return results;
  }

  // ── Stats (fast — no full import) ─────────────────────────────────────────

  async getImportStats(profilePath) {
    let profile;
    if (profilePath) {
      try {
        await fs.access(profilePath);
        profile = { name: path.basename(profilePath), path: profilePath };
      } catch {
        profile = null;
      }
    } else {
      profile = await this.getDefaultProfile();
    }
    if (!profile) return { available: false, bookmarks: 0, history: 0, cookies: 0, passwords: 0, autofill: 0 };

    const p = profile.path;

    const countDb = async (file, table, col = "*") => {
      try {
        const tmp = await this._copyToTemp(path.join(p, file), "ff_stat");
        const rows = await this._queryDb(tmp, `SELECT COUNT(${col}) as n FROM ${table}`, r => r.n);
        await fs.unlink(tmp).catch(() => {});
        return rows[0] || 0;
      } catch { return 0; }
    };

    const countPasswords = async () => {
      try {
        const raw = await fs.readFile(path.join(p, "logins.json"), "utf8");
        return (JSON.parse(raw).logins || []).length;
      } catch { return 0; }
    };

    const [bookmarks, history, cookies, passwords, autofill] = await Promise.all([
      countDb("places.sqlite", "moz_bookmarks"),
      countDb("places.sqlite", "moz_places"),
      countDb("cookies.sqlite", "moz_cookies"),
      countPasswords(),
      countDb("formhistory.sqlite", "moz_formhistory"),
    ]);

    return { available: true, bookmarks, history, cookies, passwords, autofill };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  async _copyToTemp(dbPath, tag) {
    const tmp = path.join(os.tmpdir(), `orion_${tag}_${Date.now()}.db`);
    await fs.copyFile(dbPath, tmp);
    return tmp;
  }

  _queryDb(dbPath, sql, mapper) {
    return new Promise((resolve, reject) => {
      const db = new Database(dbPath, Database.OPEN_READONLY, (err) => {
        if (err) return reject(err);
      });
      db.all(sql, (err, rows) => {
        db.close(() => {});
        if (err) return reject(err);
        resolve((rows || []).map(mapper));
      });
    });
  }

  _toUnix(firefoxMicros) {
    if (!firefoxMicros) return Date.now();
    return Math.floor(firefoxMicros / 1000);
  }
}

module.exports = FirefoxImporter;
