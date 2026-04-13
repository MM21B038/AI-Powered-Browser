import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  base: "./",
  resolve: {
    alias: {
      "@a2ui-internal/v0_8/server-to-client-schema": path.join(
        __dirname,
        "node_modules/@a2ui/web_core/src/v0_8/schema/server-to-client.js",
      ),
    },
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Order matters: react-dom must not match `react/` patterns.
          if (id.includes("node_modules/react-dom")) return "vendor-react-dom";
          if (id.includes("node_modules/react/")) return "vendor-react";
          if (id.includes("node_modules/scheduler")) return "vendor-react";
          if (id.includes("node_modules/mathjs")) return "vendor-mathjs";
          if (id.includes("node_modules/highlight.js")) return "vendor-highlight";
          if (id.includes("node_modules/marked") || id.includes("node_modules/dompurify")) {
            return "vendor-markdown";
          }
          if (id.includes("node_modules/zustand")) return "vendor-zustand";
          return "vendor-misc";
        },
      },
    },
  },
});
