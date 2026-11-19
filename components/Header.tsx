import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { currentUser } from "@/lib/dal";
import { MobileMenu } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";

const LINKS: readonly (readonly [string, string])[] = [
  ["/#platforms", "Platforms"],
  ["/#services", "Services"],
  ["/#engine", "HarnessRouter"],
  ["/#work", "Launch week"],
  ["/#rates", "Pricing"],
];

const NAV = "inline-flex min-h-10 items-center rounded-full px-3 text-sm text-muted transition-colors hover:bg-sunken hover:text-ink";

export function Wordmark() {
  return (
    <Link href="/" className="group inline-flex items-baseline gap-1.5" aria-label="LiftPage home">
      {/* 468×530 source, cropped tight to the mark. Decorative: the link carries the name. */}
      <Image src="/liftlogo.png" alt="" width={468} height={530} loading="eager" className="logo-mark h-7 w-auto self-center" />
      <span className="display text-[1.75rem] leading-none">LiftPage</span>
      <span aria-hidden="true" className="size-1.5 translate-y-[-2px] rounded-full bg-accent transition-transform group-hover:-translate-y-1.5" />
    </Link>
  );
}

export async function Header() {
  const user = await currentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-8">
        <Wordmark />
        <nav aria-label="Main" className="flex flex-wrap items-center gap-0.5">
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
                <button type="submit" className={NAV}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <span className="hidden items-center gap-0.5 md:flex">
                {LINKS.map(([href, label]) => (
                  <Link key={href} href={href} className={NAV}>
                    {label}
                  </Link>
                ))}
              </span>
              <Link href="/login" className={`${NAV.replace("inline-flex ", "")} hidden md:inline-flex`}>
                Sign in
              </Link>
            </>
          )}
          {user ? (
            <ThemeToggle />
          ) : (
            <span className="hidden md:inline-flex">
              <ThemeToggle />
            </span>
          )}
          {user ? null : (
            <>
              <Link href="/#start" className="btn-primary btn-sm ml-1">
                Start a campaign
              </Link>
              <MobileMenu links={[...LINKS, ["/login", "Sign in"]]} />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
