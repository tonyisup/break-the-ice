import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderPageResponse } from "../../api/_pageMetadata";

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Homepage title</title>
    <meta name="description" content="Homepage description" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://breaktheiceberg.com/" />
    <meta property="og:title" content="Homepage title" />
    <meta name="twitter:title" content="Homepage title" />
  </head>
  <body><div id="root"></div></body>
</html>`;

const readResponseMetadata = (pathname: string) => {
  const response = renderPageResponse(indexHtml, pathname);
  const document = new JSDOM(response.html).window.document;
  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content;

  return {
    ...response,
    title: document.title,
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    description: meta('meta[name="description"]'),
    robots: meta('meta[name="robots"]'),
    ogTitle: meta('meta[property="og:title"]'),
    ogUrl: meta('meta[property="og:url"]'),
    twitterTitle: meta('meta[name="twitter:title"]'),
  };
};

describe("initial page HTML metadata", () => {
  it("renders pricing metadata into the initial response", () => {
    const response = readResponseMetadata("/pricing");

    expect(response.statusCode).toBe(200);
    expect(response.title).toBe("Team Pricing | Break the Ice(berg)");
    expect(response.description).toContain("shared conversation starters");
    expect(response.canonical).toBe("https://breaktheiceberg.com/pricing");
    expect(response.robots).toBe("index, follow");
    expect(response.ogTitle).toBe(response.title);
    expect(response.twitterTitle).toBe(response.title);
  });

  it("renders private app metadata and noindex in the initial response", () => {
    const response = readResponseMetadata("/app");

    expect(response.statusCode).toBe(200);
    expect(response.title).toBe("App | Break the Ice(berg)");
    expect(response.canonical).toBe("https://breaktheiceberg.com/app");
    expect(response.robots).toBe("noindex, nofollow");
    expect(response.ogUrl).toBe(response.canonical);
  });

  it("returns missing-page metadata with a real 404 response", () => {
    const response = readResponseMetadata("/not-a-real-route");

    expect(response.statusCode).toBe(404);
    expect(response.title).toBe("Page Not Found | Break the Ice(berg)");
    expect(response.canonical).toBe("https://breaktheiceberg.com/not-a-real-route");
    expect(response.robots).toBe("noindex, nofollow");
    expect(response.ogTitle).toBe(response.title);
    expect(response.twitterTitle).toBe(response.title);
  });

  it("does not treat a route that merely starts with a private prefix as known", () => {
    const response = readResponseMetadata("/application");

    expect(response.statusCode).toBe(404);
    expect(response.title).toBe("Page Not Found | Break the Ice(berg)");
  });
});
