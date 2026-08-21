import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RouteMetadata } from "./RouteMetadata";

// Regression: launch checklist items 3-5 — routes shared one generic title and description.
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-local-2026-08-21.md

const renderMetadata = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <RouteMetadata />
    </MemoryRouter>,
  );

describe("RouteMetadata", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("sets unique metadata and absolute share URLs for public routes", async () => {
    const routes = ["/", "/pricing", "/about", "/contact", "/privacy", "/terms"];
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const route of routes) {
      const view = renderMetadata(route);

      await waitFor(() => {
        expect(document.title).not.toBe("");
      });

      titles.add(document.title);
      descriptions.add(
        document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "",
      );
      expect(
        document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
      ).toBe(`https://breaktheiceberg.com${route === "/" ? "/" : route}`);
      expect(
        document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content,
      ).toBe("https://breaktheiceberg.com/og-preview.png");
      expect(
        document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content,
      ).toBe("index, follow");

      view.unmount();
    }

    expect(titles.size).toBe(routes.length);
    expect(descriptions.size).toBe(routes.length);
  });

  it("keeps private, confirmation, and missing pages out of search results", async () => {
    for (const route of ["/app", "/thank-you", "/missing-page"]) {
      const view = renderMetadata(route);

      await waitFor(() => {
        expect(
          document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content,
        ).toBe("noindex, nofollow");
      });

      view.unmount();
    }
  });
});
