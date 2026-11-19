"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

/** Phone-only menu (below md) for the section links the header hides. */
export function MobileMenu({ links }: { links: readonly (readonly [string, string])[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-sunken"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
        </svg>
      </button>
      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Sections"
          className="absolute inset-x-0 top-full border-b border-line bg-canvas px-4 pb-6 pt-2 shadow-card"
        >
          <ul>
            {links.map(([href, label]) => (
              <li key={href}>
                <Link href={href} onClick={close} className="flex min-h-12 items-center border-b border-line text-lg">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            Theme
            <ThemeToggle />
          </div>
        </nav>
      ) : null}
    </div>
  );
}
