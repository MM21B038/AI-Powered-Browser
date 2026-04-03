/**
 * Rasterize build/app-icon.svg → build/icon.png (1024²) for electron-builder.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const svgPath = path.join(root, "build", "app-icon.svg");
const outPath = path.join(root, "build", "icon.png");

const svg = fs.readFileSync(svgPath);
await sharp(svg).resize(1024, 1024, { fit: "fill" }).png().toFile(outPath);
console.log(`[rasterize-app-icon] wrote ${path.relative(root, outPath)}`);
