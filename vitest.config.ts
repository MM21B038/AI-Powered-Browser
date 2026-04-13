import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@a2ui-internal/v0_8/server-to-client-schema": path.join(
        __dirname,
        "node_modules/@a2ui/web_core/src/v0_8/schema/server-to-client.js",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/test-*.ts", "electron/**/test-*.ts"],
  },
});
