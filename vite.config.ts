import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * GitHub Pages serves 404.html for unknown paths. Making it a copy of index.html
 * lets React Router handle deep links like /planner/... on reload.
 */
function spaFallback(): Plugin {
  return {
    name: "spa-404-fallback",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type !== "asset") return;
      this.emitFile({ type: "asset", fileName: "404.html", source: index.source });
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallback()],
  base: "/MSE-Course-Planner/",
  build: {
    outDir: "docs",
  },
  server: {
    proxy: {
      // RMP proxy server (npm run server). Production uses VITE_RMP_API_URL instead.
      "/api": "http://localhost:3001",
    },
  },
});
