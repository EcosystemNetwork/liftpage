import type { Metadata } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { SkipLink } from "@/components/SkipLink";
import "./globals.css";

const sans = Schibsted_Grotesk({
  variable: "--font-sans-face",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "LiftPage — Attention into traction",
    template: "%s — LiftPage",
  },
  description:
    "LiftPage is a digital media marketing agency for technology startups, founders, and hackathons. Instagram, TikTok, X, LinkedIn, and YouTube.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-ink text-paper">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
