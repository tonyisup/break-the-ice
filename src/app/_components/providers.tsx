import { TRPCReactProvider } from "~/trpc/react";
import { PostHogProvider } from "./post-hog-provider";
import { ThemeProvider } from "./theme-provider";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider>
        <TRPCReactProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </TRPCReactProvider>
    </PostHogProvider>
  )
}
