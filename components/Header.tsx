import Link from "next/link";

const LINKS = [
  ["/#platforms", "Platforms"],
  ["/#services", "Services"],
  ["/#work", "Work"],
  ["/#rates", "Pricing"],
];

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-8">
        <div>
          <Link href="/" className="text-2xl font-semibold tracking-tight text-tape">
            LiftPage
          </Link>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
            Social media marketing
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em]">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex min-h-10 items-center px-2 text-paper">
              {label}
            </Link>
          ))}
          <Link href="/#start" className="inline-flex min-h-10 items-center bg-tape px-3 text-ink">
            Start
          </Link>
        </nav>
      </div>
    </header>
  );
}
