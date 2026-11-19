import Link from "next/link";
import { Header } from "@/components/Header";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-24 md:px-8 md:py-32">
        <p className="eyebrow text-[0.75rem] text-accent">404</p>
        <h1 className="display mt-4 text-6xl md:text-7xl">
          This page <em className="text-accent">isn&apos;t here.</em>
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">The link may be old, or the page moved.</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary min-h-12 px-6 text-base">
            Back to the homepage
          </Link>
          <Link href="/#start" className="btn-ghost min-h-12 px-6 text-base">
            Start a campaign
          </Link>
        </div>
      </main>
    </>
  );
}
