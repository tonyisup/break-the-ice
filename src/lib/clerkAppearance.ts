import { shadcn } from "@clerk/themes";
import type { Appearance } from "@clerk/types";

/** Map app HSL tokens (see index.css) to Clerk variable names. */
const appColorVariables = {
  colorBackground: "hsl(var(--card))",
  colorForeground: "hsl(var(--card-foreground))",
  colorPrimary: "hsl(var(--primary))",
  colorPrimaryForeground: "hsl(var(--primary-foreground))",
  colorMuted: "hsl(var(--muted))",
  colorMutedForeground: "hsl(var(--muted-foreground))",
  colorInput: "hsl(var(--input))",
  colorInputForeground: "hsl(var(--foreground))",
  colorBorder: "hsl(var(--border))",
  colorRing: "hsl(var(--ring))",
  colorDanger: "hsl(var(--destructive))",
  colorNeutral: "hsl(var(--foreground))",
  colorModalBackdrop: "hsl(var(--background) / 0.8)",
  borderRadius: "var(--radius)",
  fontFamily:
    '"Inter Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const billingDrawerElements = {
  drawerBackdrop: { zIndex: 100 },
  drawerRoot: { zIndex: 101, paddingTop: "5rem" },
  drawerContent: { marginTop: "0.5rem" },
};

/** Inline OrganizationProfile on settings — layout only; colors come from provider. */
export const embeddedOrganizationProfileAppearance: Appearance = {
  elements: {
    rootBox: {
      width: "100%",
      maxWidth: "100%",
      minHeight: "auto",
      height: "auto",
    },
    cardBox: {
      width: "100%",
      maxWidth: "100%",
      minHeight: "auto",
      height: "auto",
      boxShadow: "none",
    },
    card: {
      width: "100%",
      maxWidth: "100%",
      minHeight: "auto",
      height: "auto",
    },
    scrollBox: {
      width: "100%",
      maxWidth: "100%",
      minHeight: "auto",
      height: "auto",
    },
    pageScrollBox: {
      width: "100%",
      maxWidth: "100%",
      minHeight: "auto",
      height: "auto",
    },
    navbar: {
      maxWidth: "100%",
    },
  },
};

export function getClerkAppearance(isDark: boolean): Appearance {
  return {
    theme: shadcn,
    variables: appColorVariables,
    captcha: { theme: isDark ? "dark" : "light" },
    elements: billingDrawerElements,
  };
}
