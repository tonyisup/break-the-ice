// Keeps the admin portal out of the public bundle. Code outside src/admin may
// reach admin only through the lazy import in main.tsx; a static import would
// pull admin pages into the bundle every visitor downloads.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const srcDir = path.resolve(__dirname, "..");
const adminDir = path.resolve(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === adminDir ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

// Static imports, re-exports, side-effect imports and vi.mock paths.
const specifierPattern =
  /(?:\bfrom\s+|\bimport\s+|vi\.mock\(\s*)["']([^"']+)["']/g;

function resolvesIntoAdmin(file: string, specifier: string): boolean {
  let target: string;
  if (specifier.startsWith("@/")) target = path.join(srcDir, specifier.slice(2));
  else if (specifier.startsWith(".")) target = path.resolve(path.dirname(file), specifier);
  else return false;
  return target === adminDir || target.startsWith(adminDir + path.sep);
}

describe("admin bundle boundary", () => {
  it("has no static imports of src/admin from outside it", () => {
    const offenders = sourceFiles(srcDir).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [...text.matchAll(specifierPattern)]
        .map((match) => match[1])
        .filter((specifier) => resolvesIntoAdmin(file, specifier))
        .map((specifier) => `${path.relative(srcDir, file)} -> ${specifier}`);
    });
    expect(offenders).toEqual([]);
  });

  it("main.tsx loads the admin portal lazily", () => {
    const main = readFileSync(path.join(srcDir, "main.tsx"), "utf8");
    expect(main).toMatch(/lazy\(\(\) => import\(["']\.\/admin\/AdminApp["']\)\)/);
  });
});
