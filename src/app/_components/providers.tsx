"use client";
import { TRPCReactProvider } from "~/trpc/react";
import { PostHogProvider } from "./post-hog-provider";
import { ThemeProvider } from "./theme-provider";
import { useState, useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <PostHogProvider>
      <TRPCReactProvider>
        {mounted ? (
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        ) : (
          children
        )}
      </TRPCReactProvider>
    </PostHogProvider>
  );
}
