/**
 * Fails if any first-party directory under src/, electron/, docs/, or scripts/
 * is not kebab-case (lowercase ASCII letters, digits, single hyphens between segments).
 * Dot-directories (.git, .cursor) and build/vendor trees are skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/** @type {string[]} */
const ROOTS = ["src", "electron", "docs", "scripts"];

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", "out"]);

/** kebab-case segment: my-feature, v2-api, modals */
const KEBAB_DIR = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * @param {string} dir
 * @param {string} relPosix
 */
function walk(dir, relPosix) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (SKIP_DIR_NAMES.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = relPosix ? `${relPosix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!KEBAB_DIR.test(e.name)) {
        console.error(`[check-kebab-dirs] Invalid directory name (use kebab-case): ${rel}`);
        process.exitCode = 1;
      } else {
        walk(full, rel);
      }
    }
  }
}

for (const r of ROOTS) {
  const p = path.join(ROOT, r);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    walk(p, r);
  }
}

if (process.exitCode) process.exit(1);
