import "server-only";
import { db, must, supabaseReady } from "./supabase/server";
import { cleanTools } from "./tools";
import { effectiveRole, isOwnerEmail, OWNER_EMAILS } from "./owner";
import { CLIENT_STAGES, type AccountsFile, type ClientStage, type Metric, type User } from "./types";

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Row = Record<string, unknown>;

export function toUser(row: Row): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string) || "",
    company: (row.company as string) || "",
    // Only the owner emails can be admins, whatever the row says.
    role: effectiveRole(row.role as string, row.email as string),
    createdAt: row.created_at as string,
    lastLoginAt: (row.last_login_at as string | null) ?? undefined,
    disabled: Boolean(row.disabled),
    // Before the admin-tools migration there is no stage column.
    stage: CLIENT_STAGES.includes(row.stage as ClientStage) ? (row.stage as ClientStage) : "onboarding",
    // Before the client-tools migration there is no tools column: nothing switched on.
    tools: cleanTools(row.tools),
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

/** The owner account bootstrap makes: LIFTPAGE_ADMIN_EMAIL if it is an owner email, else the first owner. */
export function ownerEmail(): string {
  const asked = process.env.LIFTPAGE_ADMIN_EMAIL?.trim().toLowerCase();
  return asked && isOwnerEmail(asked) ? asked : OWNER_EMAILS[0];
}

/**
 * Makes the owner admin from LIFTPAGE_ADMIN_PASSWORD when the owner isn't one yet, and
 * demotes any other admin row left from before admin was locked to the owner. Runs at most
 * once per server process.
 */
export function bootstrapAdmin(): Promise<void> {
  bootstrapping ??= (async () => {
    if (!supabaseReady()) return;
    must(
      await db().from("profiles").update({ role: "client" }).eq("role", "admin").not("email", "in", `(${OWNER_EMAILS.map((e) => `"${e}"`).join(",")})`),
      "demote non-owners",
    );
    const email = ownerEmail();
    const password = process.env.LIFTPAGE_ADMIN_PASSWORD;
    if (!password) return;
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
  return Boolean(process.env.LIFTPAGE_ADMIN_PASSWORD);
}

/** True once an owner email holds the admin role. Other admin rows don't count. */
export async function adminExists(): Promise<boolean> {
  if (!supabaseReady()) return false;
  const { count, error } = await db()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .in("email", [...OWNER_EMAILS]);
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
  if (!row) return undefined;
  const user = toUser(row);
  // Until the client-tools migration adds profiles.tools, a client's tools live in their
  // Supabase Auth app_metadata, which only the server's secret key can write.
  if (!("tools" in row) && user.role === "client") user.tools = await metadataTools(id);
  return user;
}

/** A client's tools from Auth app_metadata. Never throws: a failure means no tools. */
export async function metadataTools(id: string): Promise<User["tools"]> {
  try {
    const { data, error } = await db().auth.admin.getUserById(id);
    if (error) return [];
    return cleanTools((data.user?.app_metadata as { tools?: unknown } | undefined)?.tools);
  } catch {
    return [];
  }
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const row = must(await db().from("profiles").select("*").eq("email", email.trim().toLowerCase()).maybeSingle(), "find user");
  return row ? toUser(row) : undefined;
}

export async function touchLogin(id: string) {
  await db().from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", id);
}

export async function setProfile(id: string, patch: Partial<Pick<User, "name" | "company" | "role">>) {
  if (patch.role === "admin") {
    const user = await findUser(id);
    if (!user || !isOwnerEmail(user.email)) throw new Error("Only the owner account can be an admin.");
  }
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
  if (password.length < 8) return "Use at least 8 characters.";
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

/**
 * Self-serve sign-up without Supabase sending its own email (its built-in sender is
 * capped at a few emails an hour). Creates the unconfirmed auth user; the trigger makes
 * the profile. `exists` means the email already has an account.
 */
export async function signupLink(
  email: string,
  password: string,
  meta: { name: string; company: string },
): Promise<{ url: string; userId: string } | { error: string; code?: string }> {
  const { siteUrl } = await import("./site");
  const { data, error } = await db().auth.admin.generateLink({ type: "signup", email, password, options: { data: meta } });
  if (error || !data.properties?.hashed_token) return { error: error?.message ?? "No link came back.", code: error?.code };
  const url = new URL("/auth/confirm", siteUrl());
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "signup");
  url.searchParams.set("next", "/account");
  return { url: url.toString(), userId: data.user.id };
}
