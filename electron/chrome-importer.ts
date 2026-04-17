import path from "node:path";

/* Implementation lives alongside compiled output (copied by build:electron). */
const ChromeImporterJs = require(path.join(__dirname, "chrome-importer.impl.js"));

export class ChromeImporter extends ChromeImporterJs {}
