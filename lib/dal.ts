import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { findUser, toPublic } from "./accounts";
import { SESSION_COOKIE, SESSION_DAYS, readSession, signSession } from "./session";
import type { PublicUser, User } from "./types";

/**
 * The data access layer. Every page, server action, and route handler that needs a
 * person goes through here. The proxy only does the early redirect.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  const claims = await readSession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await findUser(claims.u);
  if (!user || user.disabled || user.sessionVersion !== claims.v) return null;
  return user;
});

export async function viewer(): Promise<PublicUser | null> {
  const user = await currentUser();
  return user ? toPublic(user) : null;
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

export async function startSession(user: User) {
  const { token, expires } = await signSession(user.id, user.sessionVersion);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Only same-site paths, so ?next= can't bounce someone off the site. */
export function safeNext(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
