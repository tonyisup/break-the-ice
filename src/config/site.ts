export const siteConfig = {
  name: "Break the Ice(berg)",
  shortName: "Break the Ice",
  origin: "https://breaktheiceberg.com",
  supportEmail: "breakingthaticeberg@gmail.com",
  defaultTitle: "Break the Ice(berg) | Better Conversation Starters",
  defaultDescription:
    "Find thoughtful conversation starters for teams, classrooms, events, and everyday connection.",
  ogImagePath: "/og-preview.png",
} as const;

export const absoluteSiteUrl = (path: string) =>
  new URL(path, siteConfig.origin).toString();
