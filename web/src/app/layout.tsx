import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Fraunces is a variable font: leaving `weight` unset loads the variable axis
// (covers 400/500/600) and lets us add the optical-size axis.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-fraunces",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-public-sans",
});

export const metadata: Metadata = {
  title: "Ward",
  description: "Ward — the connected patient process",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${publicSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
