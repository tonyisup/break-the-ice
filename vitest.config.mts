import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "frontend",
          include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: "./vitest.setup.ts",
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts", "convex/**/*.spec.ts"],
          environment: "edge-runtime",
          setupFiles: "./vitest.setup.ts",
          server: { deps: { inline: ["convex-test"] } },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
