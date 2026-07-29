import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Fuckers HQ",
    template: "%s | Fuckers HQ",
  },
  description: "The official Fuckers HQ storefront for skate goods.",
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
