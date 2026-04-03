/// <reference types="vite/client" />

/**
 * Module map for convex-test only — lives outside `convex/` so `npx convex deploy`
 * does not try to analyze Vite's `import.meta.glob`.
 */
export const convexFunctionModules = import.meta.glob("./convex/**/*.ts");
