import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { OCCASIONS, getOccasionAppUrl, getOccasionBySlug } from "./occasions";
import {
  STYLE_BRIEF_LINES,
  TONE_BRIEF_LINES,
  TOPIC_BRIEF_LINES,
} from "../../convex/data/briefLines";
import { renderPageResponse } from "../../api/_pageMetadata";

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Homepage title</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("occasions config", () => {
  it("maps every occasion filter slug to a real style, tone, or topic", () => {
    const slugs = new Set<string>();

    for (const occasion of OCCASIONS) {
      expect(slugs.has(occasion.slug)).toBe(false);
      slugs.add(occasion.slug);
      expect(occasion.sampleCards.length).toBeGreaterThanOrEqual(3);
      expect(getOccasionBySlug(occasion.slug)).toBe(occasion);
      expect(getOccasionAppUrl(occasion)).toBe(`/app?occasion=${occasion.slug}`);

      if (occasion.filters.style) {
        expect(STYLE_BRIEF_LINES).toHaveProperty(occasion.filters.style);
      }
      if (occasion.filters.tone) {
        expect(TONE_BRIEF_LINES).toHaveProperty(occasion.filters.tone);
      }
      if (occasion.filters.topic) {
        expect(TOPIC_BRIEF_LINES).toHaveProperty(occasion.filters.topic);
      }
      expect(
        Boolean(occasion.filters.style || occasion.filters.tone || occasion.filters.topic),
      ).toBe(true);
    }
  });

  it("renders unique SEO metadata for /occasions and each occasion page, and 404 for unknown slugs", () => {
    const indexResponse = renderPageResponse(indexHtml, "/occasions");
    expect(indexResponse.statusCode).toBe(200);
    const indexDoc = new JSDOM(indexResponse.html).window.document;
    expect(indexDoc.title).toContain("Occasion");
    expect(indexDoc.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "index, follow",
    );

    const detailResponse = renderPageResponse(indexHtml, "/occasions/dinner-party");
    expect(detailResponse.statusCode).toBe(200);
    const detailDoc = new JSDOM(detailResponse.html).window.document;
    expect(detailDoc.title).toBe("Dinner Party Conversation Starters | Break the Ice(berg)");
    expect(detailDoc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://breaktheiceberg.com/occasions/dinner-party",
    );

    const missingResponse = renderPageResponse(indexHtml, "/occasions/not-real");
    expect(missingResponse.statusCode).toBe(404);
    const missingDoc = new JSDOM(missingResponse.html).window.document;
    expect(missingDoc.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, nofollow",
    );
  });
});
