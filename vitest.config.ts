import { defineConfig } from "vitest/config";
import path from "path";

// Only the "@/" alias matters here - these tests exercise pure lib/
// functions directly, not React components or the Next.js runtime, so
// nothing else from next.config.mjs needs mirroring.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
