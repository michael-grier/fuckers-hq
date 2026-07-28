import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import "./globals.css";

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
      <body>
        <ClerkProvider>
          <NuqsAdapter>{children}</NuqsAdapter>
        </ClerkProvider>
      </body>
    </html>
  );
}
