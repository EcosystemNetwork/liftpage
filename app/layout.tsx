import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SkipLink } from "@/components/SkipLink";
import { DESCRIPTION, SITE } from "@/lib/seo";
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
  description: DESCRIPTION,
  metadataBase: new URL(SITE),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "LiftPage",
    url: "/",
    title: "LiftPage — Attention into traction",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "LiftPage — Attention into traction",
    description: DESCRIPTION,
  },
};

/** Tells search engines who runs the site. Add social profile URLs to sameAs once they're live. */
const ORGANIZATION = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "LiftPage",
  url: `${SITE}/`,
  logo: `${SITE}/icon.png`,
  description: DESCRIPTION,
});

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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ORGANIZATION }} />
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
