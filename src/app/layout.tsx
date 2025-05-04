import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

import { Providers } from "./_components/providers";
import { Analytics } from "@vercel/analytics/react"
import { Toaster } from "~/components/ui/toaster";

export const metadata: Metadata = {
  title: "Break the Ice(berg)",
  description: "Or not and embrace the awkward",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
        <Toaster />
      </body>
    </html>
  );
}
