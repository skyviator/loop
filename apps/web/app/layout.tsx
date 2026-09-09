import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { PwaProvider } from "@/components/pwa-provider";

import "./globals.css";

const manrope = localFont({
  src: "../../../packages/brand/assets/fonts/Manrope-Variable.woff2",
  display: "swap",
  variable: "--font-manrope",
  weight: "400 700",
});

export const metadata: Metadata = {
  applicationName: "Loop",
  title: "Loop",
  description: "Brighter days together.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/loop-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/loop-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/loop-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2F6F68",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="font-sans antialiased"><PwaProvider>{children}</PwaProvider></body>
    </html>
  );
}
