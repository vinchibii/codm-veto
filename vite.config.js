import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

// VITE_PREVIEW=1 builds a one-file practice-only copy (used for the Claude preview). Vercel uses the normal build.
const singleFile = process.env.VITE_PREVIEW === "1";

export default defineConfig({
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: { outDir: singleFile ? "dist-preview" : "dist", copyPublicDir: !singleFile }
});
