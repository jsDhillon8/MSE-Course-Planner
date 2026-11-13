import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
