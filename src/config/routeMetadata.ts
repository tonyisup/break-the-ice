import { siteConfig } from "./site";

export type PageMetadata = {
  title: string;
  description: string;
  noIndex?: boolean;
};

export const publicRouteMetadata: Record<string, PageMetadata> = {
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
    description: "Review the terms that apply when using Break the Ice(berg).",
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

export const privateRoutePrefixes = [
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
] as const;

export const normalizeRoutePath = (pathname: string) => {
  const trimmedPath = pathname.replace(/^\/+|\/+$/g, "");
  return trimmedPath ? `/${trimmedPath}` : "/";
};

const matchesPrivateRoute = (pathname: string) =>
  privateRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

export const isKnownRoutePath = (pathname: string) =>
  Boolean(publicRouteMetadata[pathname]) ||
  pathname === "/thank-you" ||
  pathname.startsWith("/question/") ||
  matchesPrivateRoute(pathname);

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

  if (matchesPrivateRoute(pathname)) {
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
