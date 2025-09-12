import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environmentMatchGlobs: [
      // all tests in convex/ will run in edge-runtime
      ["convex/**", "edge-runtime"],
      // all other tests use jsdom
      ["src/**", "jsdom"],
    ],
    server: { deps: { inline: ["convex-test"] } },
    setupFiles: './vitest.setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
