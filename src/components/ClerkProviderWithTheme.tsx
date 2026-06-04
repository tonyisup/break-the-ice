import { ClerkProvider } from "@clerk/clerk-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getClerkAppearance } from "@/lib/clerkAppearance";

/** Mirrors useTheme's html.dark toggle without requiring StorageProvider. */
function useDocumentEffectiveTheme(): "light" | "dark" {
  const read = () =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";

  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(read);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setEffectiveTheme(read());
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", sync);
    };
  }, []);

  return effectiveTheme;
}

type ClerkProviderWithThemeProps = {
  children: ReactNode;
};

export function ClerkProviderWithTheme({ children }: ClerkProviderWithThemeProps) {
  const effectiveTheme = useDocumentEffectiveTheme();
  const appearance = useMemo(
    () => getClerkAppearance(effectiveTheme === "dark"),
    [effectiveTheme]
  );

  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      appearance={appearance}
    >
      {children}
    </ClerkProvider>
  );
}
