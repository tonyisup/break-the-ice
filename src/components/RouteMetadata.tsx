import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { absoluteSiteUrl, siteConfig } from "@/config/site";
import { getRouteMetadata, normalizeRoutePath } from "@/config/routeMetadata";

const upsertMeta = (
  selector: string,
  identity: Record<string, string>,
  content: string,
) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    Object.entries(identity).forEach(([key, value]) => element?.setAttribute(key, value));
    document.head.appendChild(element);
  }
  element.content = content;
};

const upsertCanonical = (href: string) => {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
};

export const RouteMetadata = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const routePath = normalizeRoutePath(pathname);
    const metadata = getRouteMetadata(routePath);
    const canonicalUrl = absoluteSiteUrl(routePath);
    const ogImageUrl = absoluteSiteUrl(siteConfig.ogImagePath);

    document.title = metadata.title;
    upsertCanonical(canonicalUrl);
    upsertMeta('meta[name="description"]', { name: "description" }, metadata.description);
    upsertMeta(
      'meta[name="robots"]',
      { name: "robots" },
      metadata.noIndex ? "noindex, nofollow" : "index, follow",
    );
    upsertMeta('meta[property="og:type"]', { property: "og:type" }, "website");
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name" }, siteConfig.name);
    upsertMeta('meta[property="og:title"]', { property: "og:title" }, metadata.title);
    upsertMeta(
      'meta[property="og:description"]',
      { property: "og:description" },
      metadata.description,
    );
    upsertMeta('meta[property="og:url"]', { property: "og:url" }, canonicalUrl);
    upsertMeta('meta[property="og:image"]', { property: "og:image" }, ogImageUrl);
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card" }, "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title" }, metadata.title);
    upsertMeta(
      'meta[name="twitter:description"]',
      { name: "twitter:description" },
      metadata.description,
    );
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image" }, ogImageUrl);
  }, [pathname]);

  return null;
};
