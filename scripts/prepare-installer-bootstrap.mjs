/**
 * After the main app NSIS artifact exists in dist/, sync version + copy payload
 * and icon into installer-bootstrap so electron-builder can bundle the silent NSIS exe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const ibRoot = path.join(root, "installer-bootstrap");
const buildDir = path.join(ibRoot, "build");
const brDir = path.join(ibRoot, "build-resources");

fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(brDir, { recursive: true });

const parentPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const ibPkgPath = path.join(ibRoot, "package.json");
const ibPkg = JSON.parse(fs.readFileSync(ibPkgPath, "utf8"));
ibPkg.version = parentPkg.version;
fs.writeFileSync(ibPkgPath, `${JSON.stringify(ibPkg, null, 2)}\n`);

let files;
try {
  files = fs.readdirSync(distDir).filter((f) => f.endsWith(".exe") && f.includes("Setup"));
} catch {
  files = [];
}
if (!files.length) {
  console.error(
    "[prepare-installer-bootstrap] No NSIS Setup *.exe in dist/. Run:\n  npm run build:app && npx electron-builder --win nsis",
  );
  process.exit(1);
}

if (files.length > 1) {
  console.warn("[prepare-installer-bootstrap] Multiple Setup exes; using:", files[0]);
}

const from = path.join(distDir, files[0]);
const to = path.join(buildDir, "nsis-setup.exe");
fs.copyFileSync(from, to);
console.log("[prepare-installer-bootstrap] Copied", files[0], "→", path.relative(root, to));

const iconSrc = path.join(root, "build", "icon.png");
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(brDir, "icon.png"));
  console.log("[prepare-installer-bootstrap] Copied build/icon.png → installer-bootstrap/build-resources/");
} else {
  console.warn(
    "[prepare-installer-bootstrap] build/icon.png missing (run npm run rasterize-icon). Installer window may have no icon.",
  );
}
