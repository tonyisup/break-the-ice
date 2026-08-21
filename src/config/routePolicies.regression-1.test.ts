import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { privateRoutePrefixes } from "./routeMetadata";

describe("route crawler policy", () => {
  it("keeps every private metadata route out of robots.txt", () => {
    const robots = fs.readFileSync(path.resolve(process.cwd(), "public/robots.txt"), "utf8");

    for (const route of privateRoutePrefixes) {
      expect(robots).toContain(`Disallow: ${route}\n`);
    }
  });
});
