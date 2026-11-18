import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { currentUser } from "@/lib/dal";

const LINKS = [
  ["/#platforms", "Platforms"],
  ["/#services", "Services"],
  ["/#work", "Work"],
  ["/#rates", "Pricing"],
];

const NAV = "inline-flex min-h-10 items-center px-2 text-paper";

export async function Header() {
  const user = await currentUser();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-8">
        <div>
          <Link href="/" className="text-2xl font-semibold tracking-tight text-tape">
            LiftPage
          </Link>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Digital media marketing</p>
        </div>
        <nav className="flex flex-wrap items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em]">
          {user ? (
            <>
              {user.role === "admin" ? (
                <>
                  <Link href="/admin" className={NAV}>
                    Admin
                  </Link>
                  <Link href="/desk" className={NAV}>
                    Desk
                  </Link>
                </>
              ) : null}
              <Link href="/account" className={NAV}>
                Account
              </Link>
              <form action={logout}>
                <button type="submit" className={`${NAV} uppercase`}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              {LINKS.map(([href, label]) => (
                <Link key={href} href={href} className={NAV}>
                  {label}
                </Link>
              ))}
              <Link href="/login" className={NAV}>
                Sign in
              </Link>
              <Link href="/#start" className="inline-flex min-h-10 items-center bg-tape px-3 text-ink">
                Start
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
