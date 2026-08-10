import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import "./globals.css";

import { env } from "@/lib/env";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  // Absolute base for Open Graph/Twitter image URLs. Without it, Next emits relative
  // image paths that external scrapers cannot resolve, so previews silently render bare.
  // NEXT_PUBLIC_APP_URL defaults to localhost, so previews only work on a deployed URL.
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: "Fuckers Skateboards",
    template: "%s | Fuckers Skateboards",
  },
  description: "The official Fuckers Skateboards storefront.",
  openGraph: {
    siteName: "Fuckers Skateboards",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.variable}>
        <ClerkProvider>
          <NuqsAdapter>{children}</NuqsAdapter>
        </ClerkProvider>
      </body>
    </html>
  );
}
