import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { bootstrapAdmin, findUser } from "./accounts";
import { authClient, supabaseReady } from "./supabase/server";
import type { PublicUser, User } from "./types";

/**
 * The data access layer. Every page, server action, and route handler that needs a
 * person goes through here. The proxy only refreshes cookies and does the early redirect.
 *
 * Identity comes from Supabase Auth (getClaims verifies the JWT). Role and the
 * switched-off flag come from our profiles row on every request, so a demotion or a
 * switch-off bites immediately, not when the access token expires.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  // Always per request, even when Supabase isn't configured at build time; otherwise
  // Next would prerender private pages with a baked-in "signed out".
  await connection();
  if (!supabaseReady()) return null;
  await bootstrapAdmin().catch(() => undefined);
  try {
    const supabase = await authClient();
    const { data, error } = await supabase.auth.getClaims();
    const id = data?.claims?.sub;
    if (error || typeof id !== "string") return null;
    const user = await findUser(id);
    if (!user || user.disabled) return null;
    return user;
  } catch (error) {
    // Public pages read the session too; a broken backend means "signed out", not a 500.
    console.error("currentUser", error);
    return null;
  }
});

export async function viewer(): Promise<PublicUser | null> {
  return currentUser();
}

/** For pages and server actions. Sends strangers to sign in. */
export async function requireUser(next?: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export async function requireAdmin(next?: string): Promise<User> {
  const user = await requireUser(next);
  if (user.role !== "admin") redirect("/account");
  return user;
}

/** For route handlers: a Response to return when the caller isn't an admin, else the user. */
export async function adminOrResponse(): Promise<User | Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });
  return user;
}

/** Only same-site paths, so ?next= can't bounce someone off the site. */
export function safeNext(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  // URL parsing drops tabs and newlines, so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  const base = "http://same.invalid";
  return new URL(value, base).origin === base ? value : fallback;
}
