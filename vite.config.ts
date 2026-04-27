import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    // Plotly is intentionally lazy-loaded but still emits a large chunk.
    // Raise the warning limit so the build log stays actionable.
    chunkSizeWarningLimit: 5000,
    // Vite 8 uses Rolldown internally; `rollupOptions` is a deprecated alias.
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Order matters: react-dom must not match `react/` patterns.
          if (id.includes("node_modules/react-dom")) return "vendor-react-dom";
          if (id.includes("node_modules/react/")) return "vendor-react";
          if (id.includes("node_modules/scheduler")) return "vendor-react";
          if (id.includes("node_modules/mathjs")) return "vendor-mathjs";
          if (id.includes("node_modules/plotly.js-dist-min")) return "vendor-plotly";
          if (id.includes("node_modules/recharts")) return "vendor-recharts";
          if (id.includes("node_modules/highlight.js")) return "vendor-highlight";
          if (id.includes("node_modules/marked") || id.includes("node_modules/dompurify")) {
            return "vendor-markdown";
          }
          if (id.includes("node_modules/@a2ui/") || id.includes("node_modules/@ag-ui/")) return "vendor-a2ui";
          if (id.includes("node_modules/@modelcontextprotocol/")) return "vendor-mcp";
          if (id.includes("node_modules/@google/model-viewer")) return "vendor-model-viewer";
          if (id.includes("node_modules/zustand")) return "vendor-zustand";
          return "vendor-misc";
        },
      },
    },
  },
});
