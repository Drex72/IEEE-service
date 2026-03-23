import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Instrument_Serif, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/app-shell";

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
  title: "IEEE IES UNILAG Sponsorship Platform",
  description:
    "Sponsor research, outreach drafting, and delivery management for IEEE IES UNILAG programs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} font-body`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
