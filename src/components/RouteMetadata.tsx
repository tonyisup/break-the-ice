import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { absoluteSiteUrl, siteConfig } from "@/config/site";

type PageMetadata = {
  title: string;
  description: string;
  noIndex?: boolean;
};

const publicRouteMetadata: Record<string, PageMetadata> = {
  "/": {
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
  },
  "/pricing": {
    title: "Team Pricing | Break the Ice(berg)",
    description:
      "Give your team shared conversation starters, collections, scheduled prompts, and more room to create.",
  },
  "/about": {
    title: "About | Break the Ice(berg)",
    description:
      "Meet the story behind Break the Ice(berg) and its mission to turn thoughtful questions into genuine connection.",
  },
  "/contact": {
    title: "Contact | Break the Ice(berg)",
    description:
      "Contact Break the Ice(berg) with questions, suggestions, partnerships, or product feedback.",
  },
  "/privacy": {
    title: "Privacy Policy | Break the Ice(berg)",
    description:
      "Read how Break the Ice(berg) collects, uses, stores, and protects your information.",
  },
  "/terms": {
    title: "Terms of Service | Break the Ice(berg)",
    description:
      "Review the terms that apply when using Break the Ice(berg).",
  },
  "/cookies": {
    title: "Cookie Policy | Break the Ice(berg)",
    description:
      "Learn which cookies and local storage Break the Ice(berg) uses and how to control analytics consent.",
  },
  "/data-retention": {
    title: "Data Retention | Break the Ice(berg)",
    description:
      "Learn how long Break the Ice(berg) retains account and usage information.",
  },
};

const privateRoutePrefixes = [
  "/app",
  "/liked",
  "/settings",
  "/history",
  "/billing",
  "/unsubscribe",
  "/verify-subscription",
  "/add-question",
  "/org",
  "/admin",
];

export const getRouteMetadata = (pathname: string): PageMetadata => {
  const publicMetadata = publicRouteMetadata[pathname];
  if (publicMetadata) return publicMetadata;

  if (pathname === "/thank-you") {
    return {
      title: "Message Received | Break the Ice(berg)",
      description: "Your message has been sent to Break the Ice(berg).",
      noIndex: true,
    };
  }

  if (pathname.startsWith("/question/")) {
    return {
      title: "Conversation Question | Break the Ice(berg)",
      description: "Open a conversation starter from Break the Ice(berg).",
    };
  }

  if (privateRoutePrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return {
      title: `App | ${siteConfig.name}`,
      description: "Your Break the Ice(berg) question library and settings.",
      noIndex: true,
    };
  }

  return {
    title: `Page Not Found | ${siteConfig.name}`,
    description: "The page you requested could not be found.",
    noIndex: true,
  };
};

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
    const metadata = getRouteMetadata(pathname);
    const canonicalUrl = absoluteSiteUrl(pathname);
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
