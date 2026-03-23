import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Instrument_Serif, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { AppShell as AppShellLegacy } from "@/components/legacy/app-shell-legacy";
import { isLegacyLayout } from "@/lib/layout-variant";

import "./globals.css";

const displayFont = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "IEEE Sponsorship Engine",
  description: "AI-powered sponsorship outreach for hardware and electrical engineering events.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const Shell = isLegacyLayout() ? AppShellLegacy : AppShell;

  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} font-body`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
