import { JSDOM } from "jsdom";
import {
  getRouteMetadata,
  isKnownRoutePath,
  normalizeRoutePath,
} from "../src/config/routeMetadata.js";
import { absoluteSiteUrl, siteConfig } from "../src/config/site.js";

export const normalizePagePath = (pathValue: string | string[] | undefined) => {
  const rawPath = Array.isArray(pathValue) ? pathValue.join("/") : pathValue ?? "";
  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    // Keep malformed percent-encoding as a literal path so it receives a 404 response.
  }
  return normalizeRoutePath(decodedPath);
};

const appendMeta = (
  document: Document,
  attributes: Record<string, string>,
) => {
  const element = document.createElement("meta");
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  document.head.appendChild(element);
};

export const renderPageResponse = (indexHtml: string, pathname: string) => {
  const metadata = getRouteMetadata(pathname);
  const canonicalUrl = absoluteSiteUrl(pathname);
  const ogImageUrl = absoluteSiteUrl(siteConfig.ogImagePath);
  const dom = new JSDOM(indexHtml);
  const { document } = dom.window;

  document
    .querySelectorAll(
      'meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]',
    )
    .forEach((element) => element.remove());

  document.title = metadata.title;

  const canonical = document.createElement("link");
  canonical.rel = "canonical";
  canonical.href = canonicalUrl;
  document.head.appendChild(canonical);

  appendMeta(document, { name: "description", content: metadata.description });
  appendMeta(document, {
    name: "robots",
    content: metadata.noIndex ? "noindex, nofollow" : "index, follow",
  });
  appendMeta(document, { property: "og:type", content: "website" });
  appendMeta(document, { property: "og:site_name", content: siteConfig.name });
  appendMeta(document, { property: "og:title", content: metadata.title });
  appendMeta(document, { property: "og:description", content: metadata.description });
  appendMeta(document, { property: "og:url", content: canonicalUrl });
  appendMeta(document, { property: "og:image", content: ogImageUrl });
  appendMeta(document, { property: "og:image:width", content: "1200" });
  appendMeta(document, { property: "og:image:height", content: "630" });
  appendMeta(document, { name: "twitter:card", content: "summary_large_image" });
  appendMeta(document, { name: "twitter:title", content: metadata.title });
  appendMeta(document, { name: "twitter:description", content: metadata.description });
  appendMeta(document, { name: "twitter:image", content: ogImageUrl });

  return {
    statusCode: isKnownRoutePath(pathname) ? 200 : 404,
    html: dom.serialize(),
  };
};
