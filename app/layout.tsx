import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SkipLink } from "@/components/SkipLink";
import "./globals.css";

const sans = Geist({
  variable: "--font-sans-face",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const display = Instrument_Serif({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "LiftPage — Attention into traction",
    template: "%s — LiftPage",
  },
  description:
    "LiftPage is a digital media marketing agency for technology startups, founders, and hackathons. Instagram, TikTok, X, LinkedIn, and YouTube.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#13120f" },
  ],
};

/** Applies a saved theme before first paint so there is no flash. No saved choice → follow the system. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("lp-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
