import path from "node:path";

const FirefoxImporterJs = require(path.join(__dirname, "firefox-importer.impl.js"));

export class FirefoxImporter extends FirefoxImporterJs {}
