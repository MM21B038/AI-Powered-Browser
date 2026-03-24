const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const Database = require("sqlite3").verbose();

class ChromeImporter {
  constructor() {
    this.profiles = this._buildProfileList();
  }

  _buildProfileList() {
    const home = os.homedir();
    const win = process.platform === "win32";
    const mac = process.platform === "darwin";

    const bases = [];
    if (win) {
      const local = path.join(home, "AppData", "Local");
      bases.push(
        { browser: "chrome",  dir: path.join(local, "Google",    "Chrome",          "User Data") },
        { browser: "chrome",  dir: path.join(local, "Google",    "Chrome Beta",     "User Data") },
        { browser: "chrome",  dir: path.join(local, "Google",    "Chrome SxS",      "User Data") },
        { browser: "edge",    dir: path.join(local, "Microsoft", "Edge",            "User Data") },
        { browser: "brave",   dir: path.join(local, "BraveSoftware", "Brave-Browser","User Data") },
        { browser: "opera",   dir: path.join(home,  "AppData", "Roaming", "Opera Software", "Opera Stable") },
        { browser: "vivaldi", dir: path.join(local, "Vivaldi",   "User Data") },
        { browser: "chromium",dir: path.join(local, "Chromium",  "User Data") },
      );
    } else if (mac) {
      const sup = path.join(home, "Library", "Application Support");
      bases.push(
        { browser: "chrome",  dir: path.join(sup, "Google",       "Chrome")         },
        { browser: "edge",    dir: path.join(sup, "Microsoft Edge","User Data")      },
        { browser: "brave",   dir: path.join(sup, "BraveSoftware","Brave-Browser","User Data") },
        { browser: "vivaldi", dir: path.join(sup, "Vivaldi",      "User Data")      },
        { browser: "chromium",dir: path.join(sup, "Chromium",     "User Data")      },
      );
    } else {
      const cfg = path.join(home, ".config");
      bases.push(
        { browser: "chrome",  dir: path.join(cfg, "google-chrome")       },
        { browser: "edge",    dir: path.join(cfg, "microsoft-edge")       },
        { browser: "brave",   dir: path.join(cfg, "BraveSoftware","Brave-Browser") },
        { browser: "vivaldi", dir: path.join(cfg, "vivaldi")              },
        { browser: "chromium",dir: path.join(cfg, "chromium")             },
      );
    }
    return bases;
  }

  // Returns all found profile paths across all Chromium-based browsers
  async findAllProfiles() {
    const found = [];
    for (const { browser, dir } of this.profiles) {
      try {
        await fs.access(dir);
        // Scan for Default + Profile N directories
        const entries = await fs.readdir(dir);
        for (const entry of entries) {
          if (entry === "Default" || /^Profile \d+$/.test(entry)) {
            const full = path.join(dir, entry);
            try {
              const stat = await fs.stat(full);
              if (stat.isDirectory()) found.push({ browser, path: full });
            } catch { /* skip */ }
          }
        }
      } catch { /* browser not installed */ }
    }
    return found;
  }

  async findDefaultProfile() {
    const all = await this.findAllProfiles();
    return all.length ? all[0] : null;
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  async importBookmarks(profilePath) {
    const p = profilePath || (await this.findDefaultProfile())?.path;
    if (!p) throw new Error("No Chromium-based browser profile found");

    const raw = await fs.readFile(path.join(p, "Bookmarks"), "utf8");
    const parsed = JSON.parse(raw);
    const bookmarks = [], folders = [];

    for (const [rootName, rootData] of Object.entries(parsed.roots || {})) {
      if (rootData && rootData.children)
        this._walkBookmarks(rootData.children, rootName, bookmarks, folders);
    }
    return { bookmarks, folders };
  }

  _walkBookmarks(children, parentFolder, bookmarks, folders) {
    for (const item of children) {
      if (item.type === "folder") {
        const folderName = `${parentFolder}/${item.name}`;
        folders.push({ id: item.id, name: item.name, parent: parentFolder, dateAdded: this._toUnix(item.date_added) });
        if (item.children) this._walkBookmarks(item.children, folderName, bookmarks, folders);
      } else if (item.type === "url") {
        bookmarks.push({ id: item.id, title: item.name, url: item.url, folder: parentFolder, dateAdded: this._toUnix(item.date_added), source: "chrome" });
      }
    }
  }

  // ── History ────────────────────────────────────────────────────────────────

  async importHistory(profilePath) {
    const p = profilePath || (await this.findDefaultProfile())?.path;
    if (!p) throw new Error("No Chromium-based browser profile found");

    const dbPath = path.join(p, "History");
    await fs.access(dbPath);
    const tmp = await this._copyToTemp(dbPath, "history");

    return this._queryDb(tmp, `
      SELECT url, title, visit_count, last_visit_time
      FROM urls ORDER BY last_visit_time DESC LIMIT 50000
    `, (row) => ({
      url: row.url,
      title: row.title || "",
      visitCount: row.visit_count,
      lastVisitTime: this._toUnix(row.last_visit_time),
      firstVisitTime: this._toUnix(row.last_visit_time),
      source: "chrome",
    }));
  }

  // ── Cookies ────────────────────────────────────────────────────────────────

  async importCookies(profilePath) {
    const p = profilePath || (await this.findDefaultProfile())?.path;
    if (!p) throw new Error("No Chromium-based browser profile found");

    // Chrome 96+ moved cookies to Network/Cookies
    let dbPath = path.join(p, "Network", "Cookies");
    try { await fs.access(dbPath); } catch {
      dbPath = path.join(p, "Cookies");
      await fs.access(dbPath);
    }
    const tmp = await this._copyToTemp(dbPath, "cookies");

    return this._queryDb(tmp, `
      SELECT host_key, name, value, path, expires_utc, is_secure, is_httponly, samesite
      FROM cookies ORDER BY creation_utc DESC
    `, (row) => ({
      domain: row.host_key,
      name: row.name,
      value: row.value,
      path: row.path,
      expires: this._toUnix(row.expires_utc),
      secure: row.is_secure === 1,
      httpOnly: row.is_httponly === 1,
      sameSite: row.samesite,
      source: "chrome",
    }));
  }

  // ── Passwords ──────────────────────────────────────────────────────────────
  // NOTE: Chrome encrypts passwords with DPAPI (Windows) / Keychain (Mac) / libsecret (Linux).
  // We export the metadata (origin, username) but mark the password as [encrypted].
  // Full decryption requires OS-level crypto calls outside the scope of this importer.

  async importPasswords(profilePath) {
    const p = profilePath || (await this.findDefaultProfile())?.path;
    if (!p) throw new Error("No Chromium-based browser profile found");

    const dbPath = path.join(p, "Login Data");
    await fs.access(dbPath);
    const tmp = await this._copyToTemp(dbPath, "logins");

    return this._queryDb(tmp, `
      SELECT origin_url, action_url, username_element, username_value,
             password_element, date_created, date_last_used, times_used
      FROM logins ORDER BY date_last_used DESC
    `, (row) => ({
      url: row.origin_url,
      actionUrl: row.action_url,
      usernameField: row.username_element,
      username: row.username_value,
      passwordField: row.password_element,
      password: "[encrypted — requires OS decryption]",
      dateCreated: this._toUnix(row.date_created),
      dateLastUsed: this._toUnix(row.date_last_used),
      timesUsed: row.times_used,
      source: "chrome",
    }));
  }

  // ── Autofill ───────────────────────────────────────────────────────────────

  async importAutofill(profilePath) {
    const p = profilePath || (await this.findDefaultProfile())?.path;
    if (!p) throw new Error("No Chromium-based browser profile found");

    const dbPath = path.join(p, "Web Data");
    await fs.access(dbPath);
    const tmp = await this._copyToTemp(dbPath, "webdata");

    const [formData, addresses, creditCards] = await Promise.allSettled([
      this._queryDb(tmp, `
        SELECT name, value, count, date_created, date_last_used
        FROM autofill ORDER BY count DESC LIMIT 5000
      `, (row) => ({
        type: "formField",
        name: row.name,
        value: row.value,
        count: row.count,
        dateCreated: row.date_created ? row.date_created * 1000 : Date.now(),
        dateLastUsed: row.date_last_used ? row.date_last_used * 1000 : Date.now(),
        source: "chrome",
      })),
      this._queryDb(tmp, `
        SELECT guid, first_name, middle_name, last_name, email, phone_number,
               company_name, street_address, city, state, zipcode, country_code,
               date_modified, use_count
        FROM autofill_profiles ORDER BY use_count DESC
      `, (row) => ({
        type: "address",
        guid: row.guid,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone_number,
        company: row.company_name,
        streetAddress: row.street_address,
        city: row.city,
        state: row.state,
        zipCode: row.zipcode,
        country: row.country_code,
        dateModified: row.date_modified ? row.date_modified * 1000 : Date.now(),
        useCount: row.use_count,
        source: "chrome",
      })),
      this._queryDb(tmp, `
        SELECT guid, name_on_card, expiration_month, expiration_year,
               card_number_encrypted, date_modified, use_count, billing_address_id
        FROM credit_cards ORDER BY use_count DESC
      `, (row) => ({
        type: "creditCard",
        guid: row.guid,
        nameOnCard: row.name_on_card,
        expirationMonth: row.expiration_month,
        expirationYear: row.expiration_year,
        cardNumber: "[encrypted]",
        billingAddressId: row.billing_address_id,
        dateModified: row.date_modified ? row.date_modified * 1000 : Date.now(),
        useCount: row.use_count,
        source: "chrome",
      })),
    ]);

    return [
      ...(formData.status === "fulfilled" ? formData.value : []),
      ...(addresses.status === "fulfilled" ? addresses.value : []),
      ...(creditCards.status === "fulfilled" ? creditCards.value : []),
    ];
  }

  // ── Stats (fast — no full import) ─────────────────────────────────────────

  async getImportStats() {
    const profile = await this.findDefaultProfile();
    if (!profile) return { available: false, bookmarks: 0, history: 0, cookies: 0, passwords: 0, autofill: 0, browser: null };

    const p = profile.path;
    const count = async (dbFile, table, col = "*") => {
      try {
        const tmp = await this._copyToTemp(path.join(p, dbFile), "stat");
        const rows = await this._queryDb(tmp, `SELECT COUNT(${col}) as n FROM ${table}`, r => r.n);
        return rows[0] || 0;
      } catch { return 0; }
    };

    const bookmarkCount = async () => {
      try {
        const raw = await fs.readFile(path.join(p, "Bookmarks"), "utf8");
        const parsed = JSON.parse(raw);
        let n = 0;
        const walk = (node) => { if (!node) return; if (node.type === "url") n++; (node.children || []).forEach(walk); };
        Object.values(parsed.roots || {}).forEach(walk);
        return n;
      } catch { return 0; }
    };

    const [bookmarks, history, cookies, passwords, autofill] = await Promise.all([
      bookmarkCount(),
      count("History", "urls"),
      count("Cookies", "cookies").catch(() => count(path.join("Network", "Cookies"), "cookies")),
      count("Login Data", "logins"),
      count("Web Data", "autofill"),
    ]);

    return { available: true, browser: profile.browser, bookmarks, history, cookies, passwords, autofill };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  async _copyToTemp(dbPath, tag) {
    const tmp = path.join(os.tmpdir(), `orion_${tag}_${Date.now()}.db`);
    await fs.copyFile(dbPath, tmp);
    return tmp;
  }

  _queryDb(dbPath, sql, mapper) {
    return new Promise((resolve, reject) => {
      const db = new (require("sqlite3").verbose().Database)(dbPath, require("sqlite3").OPEN_READONLY, (err) => {
        if (err) return reject(err);
      });
      db.all(sql, (err, rows) => {
        db.close(() => fs.unlink(dbPath).catch(() => {}));
        if (err) return reject(err);
        resolve((rows || []).map(mapper));
      });
    });
  }

  _toUnix(chromeTime) {
    if (!chromeTime) return Date.now();
    return Math.floor(chromeTime / 1000 - 11644473600000);
  }
}

module.exports = ChromeImporter;
