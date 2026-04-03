/**
 * Builds the main app (NSIS), then the animated Electron bootstrapper that
 * bundles that NSIS exe and runs it silently with /S /D=...
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ib = path.join(root, "installer-bootstrap");

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
}

if (!fs.existsSync(path.join(ib, "node_modules"))) {
  console.log("[dist-win-animated] Installing installer-bootstrap dependencies…");
  run("npm install --no-audit --no-fund", ib);
}

run("npm run build:app");
run("npx electron-builder --win nsis");
run("node scripts/prepare-installer-bootstrap.mjs");
run("npm run dist", ib);

console.log(
  "\n[dist-win-animated] Done. See installer-bootstrap/release/ for Autonomous-Browser-Setup-*.exe",
);
