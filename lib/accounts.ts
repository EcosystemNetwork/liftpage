import "server-only";
import { db, must, supabaseReady } from "./supabase/server";
import type { AccountsFile, Metric, Role, User } from "./types";

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Row = Record<string, unknown>;

export function toUser(row: Row): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string) || "",
    company: (row.company as string) || "",
    role: row.role as Role,
    createdAt: row.created_at as string,
    lastLoginAt: (row.last_login_at as string | null) ?? undefined,
    disabled: Boolean(row.disabled),
  };
}

export function toMetric(row: Row): Metric {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    week: row.week as string,
    platform: row.platform as Metric["platform"],
    followers: Number(row.followers),
    impressions: Number(row.impressions),
    engagements: Number(row.engagements),
    clicks: Number(row.clicks),
    leads: Number(row.leads),
    at: row.at as string,
    by: row.by as string,
    source: (row.source as Metric["source"]) ?? "manual",
  };
}

let bootstrapping: Promise<void> | undefined;

/**
 * Makes the first admin from LIFTPAGE_ADMIN_EMAIL / LIFTPAGE_ADMIN_PASSWORD when there is
 * no admin yet. Does nothing once one exists. Runs at most once per server process.
 */
export function bootstrapAdmin(): Promise<void> {
  bootstrapping ??= (async () => {
    const email = process.env.LIFTPAGE_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.LIFTPAGE_ADMIN_PASSWORD;
    if (!email || !password || !supabaseReady()) return;
    if (await adminExists()) return;
    const found = must(await db().from("profiles").select("id").eq("email", email).maybeSingle(), "find owner");
    let id = found?.id as string | undefined;
    if (id) {
      const { error } = await db().auth.admin.updateUserById(id, { password, ban_duration: "none", email_confirm: true });
      if (error) throw new Error(`owner password: ${error.message}`);
    } else {
      const { data, error } = await db().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: "Owner", company: "LiftPage" },
      });
      if (error || !data.user) throw new Error(`owner account: ${error?.message}`);
      id = data.user.id;
    }
    must(await db().from("profiles").update({ role: "admin", disabled: false }).eq("id", id), "promote owner");
  })();
  bootstrapping.catch((error) => {
    console.error("admin bootstrap", error);
    bootstrapping = undefined;
  });
  return bootstrapping;
}

export function hasAdminEnv(): boolean {
  return Boolean(process.env.LIFTPAGE_ADMIN_EMAIL && process.env.LIFTPAGE_ADMIN_PASSWORD);
}

export async function adminExists(): Promise<boolean> {
  if (!supabaseReady()) return false;
  const { count, error } = await db().from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw new Error(`count admins: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function loadAccounts(): Promise<AccountsFile> {
  await bootstrapAdmin().catch(() => undefined);
  const [users, metrics] = await Promise.all([
    db().from("profiles").select("*").order("created_at"),
    db().from("metrics").select("*").order("week"),
  ]);
  return {
    users: (must(users, "load profiles") ?? []).map(toUser),
    metrics: (must(metrics, "load metrics") ?? []).map(toMetric),
  };
}

export async function findUser(id: string): Promise<User | undefined> {
  const row = must(await db().from("profiles").select("*").eq("id", id).maybeSingle(), "find user");
  return row ? toUser(row) : undefined;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const row = must(await db().from("profiles").select("*").eq("email", email.trim().toLowerCase()).maybeSingle(), "find user");
  return row ? toUser(row) : undefined;
}

export async function touchLogin(id: string) {
  await db().from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", id);
}

export async function setProfile(id: string, patch: Partial<Pick<User, "name" | "company" | "role">>) {
  must(await db().from("profiles").update(patch).eq("id", id), "update profile");
}

/**
 * Switching off bans the auth user too, so the session can't be refreshed. The profile
 * flag is what lib/dal.ts reads, so the switch-off bites on the very next request.
 */
export async function setDisabled(id: string, disabled: boolean) {
  must(await db().from("profiles").update({ disabled }).eq("id", id), "switch account");
  const { error } = await db().auth.admin.updateUserById(id, { ban_duration: disabled ? "876000h" : "none" });
  if (error) throw new Error(`ban: ${error.message}`);
}

export function signupOpen(): boolean {
  return process.env.LIFTPAGE_OPEN_SIGNUP !== "false";
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 72) return "Keep it under 72 characters.";
  return null;
}

/**
 * Invite or recovery link for a user, without Supabase sending its own email. Invite
 * creates the auth user (the trigger makes the profile). Points at /auth/confirm.
 */
export async function authLink(
  type: "invite" | "recovery",
  email: string,
  meta?: { name: string; company: string },
): Promise<{ url: string; userId: string } | { error: string }> {
  const { siteUrl } = await import("./site");
  const { data, error } =
    type === "invite"
      ? await db().auth.admin.generateLink({ type, email, options: { data: meta } })
      : await db().auth.admin.generateLink({ type, email });
  if (error || !data.properties?.hashed_token) return { error: error?.message ?? "No link came back." };
  const url = new URL("/auth/confirm", siteUrl());
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", type);
  url.searchParams.set("next", "/auth/password");
  return { url: url.toString(), userId: data.user.id };
}
