"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { authLink, EMAIL, findUser, passwordProblem, signupLink, signupOpen, touchLogin } from "@/lib/accounts";
import { track } from "@/lib/analytics";
import { requireUser, safeNext } from "@/lib/dal";
import { emailReady, sendMail } from "@/lib/email";
import { clearLimit, clientIp, limited } from "@/lib/rate";
import { siteUrl } from "@/lib/site";
import { authClient, publishableKey, supabaseReady, supabaseUrl } from "@/lib/supabase/server";

/** `fields` echoes what was typed, so React's post-action form reset doesn't wipe it. */
export type FormState = { error?: string; ok?: string; fields?: Record<string, string> } | undefined;

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function secret(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

const OFFLINE: FormState = { error: "Accounts aren't connected yet. Set the Supabase keys in .env.local." };

export async function login(_: FormState, data: FormData): Promise<FormState> {
  const result = await tryLogin(data);
  return { ...result, fields: { email: text(data, "email", 120) } };
}

async function tryLogin(data: FormData): Promise<FormState> {
  if (!supabaseReady()) return OFFLINE;
  const email = text(data, "email", 120).toLowerCase();
  const password = secret(data, "password");
  const key = `login:${email}`;
  if ((await limited(`login-ip:${await clientIp()}`, 30, 15 * 60_000)) || (await limited(key, 8, 15 * 60_000))) {
    return { error: "Too many tries. Wait fifteen minutes." };
  }
  if (!email || !password) return { error: "Email and password both." };

  const supabase = await authClient();
  const { data: session, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !session.user) {
    if (error?.code === "email_not_confirmed") return { error: "Confirm your email first. The link is in your inbox." };
    if (error?.code === "user_banned") return { error: "This account is switched off. Ask LiftPage." };
    return { error: "That email and password don't match." };
  }
  const user = await findUser(session.user.id);
  if (!user || user.disabled) {
    await supabase.auth.signOut();
    return { error: "This account is switched off. Ask LiftPage." };
  }
  await clearLimit(key);
  await touchLogin(user.id);
  await track(user.id, "signed_in", { role: user.role });
  redirect(safeNext(data.get("next"), user.role === "admin" ? "/admin" : "/account"));
}

export async function signup(_: FormState, data: FormData): Promise<FormState> {
  const result = await trySignup(data);
  return { ...result, fields: { name: text(data, "name", 80), company: text(data, "company", 80), email: text(data, "email", 120) } };
}

async function trySignup(data: FormData): Promise<FormState> {
  if (!supabaseReady()) return OFFLINE;
  if (!signupOpen()) return { error: "Sign-up is closed. Ask LiftPage for an account." };
  if (await limited(`signup:${await clientIp()}`, 5, 60 * 60_000)) {
    return { error: "Too many accounts from here. Try again later." };
  }
  const name = text(data, "name", 80);
  const company = text(data, "company", 80);
  const email = text(data, "email", 120).toLowerCase();
  const password = secret(data, "password");
  if (!name || !company) return { error: "Name and company both need a line." };
  if (!EMAIL.test(email)) return { error: "That email doesn't look usable." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  // The same answer comes back for an email that already has an account, so this can't
  // be used to find out who's a client.
  const sent: FormState = { ok: "Check your email for the confirmation link." };
  if (emailReady()) {
    // Send the confirmation through Resend: Supabase's own sender rate-limits hard.
    const link = await signupLink(email, password, { name, company });
    if ("error" in link) {
      if (link.code === "email_exists" || link.code === "user_already_exists") return sent;
      if (link.code === "weak_password") return { error: "Pick a stronger password." };
      console.error("signup link", link.error);
      return { error: "That sign-up didn't go through. Try again." };
    }
    await sendMail({
      to: email,
      subject: "Confirm your LiftPage account",
      lines: [`Hi ${name}, thanks for signing up.`, "Confirm your email to get into your account. If it wasn't you, ignore this."],
      action: { label: "Confirm my email", url: link.url },
    });
    await track(link.userId, "signed_up", {});
    return sent;
  }

  const supabase = await authClient();
  const { data: result, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, company }, emailRedirectTo: `${siteUrl()}/auth/confirm?next=/account` },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "Pick a stronger password." };
    return { error: "That sign-up didn't go through. Try again." };
  }
  if (result.user) await track(result.user.id, "signed_up", {});
  // With email confirmation on (the Supabase default) there is no session yet. The same
  // answer comes back for an email that already has an account, so this can't be used
  // to find out who's a client.
  if (!result.session) return { ok: "Check your email for the confirmation link." };
  redirect("/account");
}

export async function logout() {
  if (supabaseReady()) await (await authClient()).auth.signOut();
  redirect("/login");
}

export async function changePassword(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = secret(data, "current");
  const next = secret(data, "password");
  if (await limited(`pw:${user.id}`, 8, 15 * 60_000)) return { error: "Too many tries. Wait fifteen minutes." };
  // Check the current password on a throwaway client, so the real session is untouched.
  const probe = createClient(supabaseUrl()!, publishableKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await probe.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) return { error: "Current password is wrong." };
  await probe.auth.signOut({ scope: "local" });
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  const supabase = await authClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.code === "same_password" ? "That's the password you have now." : "The password didn't save." };
  await supabase.auth.signOut({ scope: "others" });
  return { ok: "Password changed. Other devices are signed out." };
}

/** After an invite or reset link: the session exists, the password doesn't yet. */
export async function setPassword(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser("/auth/password");
  const password = secret(data, "password");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  const supabase = await authClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error && error.code !== "same_password") return { error: "The password didn't save. Open the link again." };
  await supabase.auth.signOut({ scope: "others" });
  await touchLogin(user.id);
  redirect(user.role === "admin" ? "/admin" : "/account");
}

export async function forgotPassword(_: FormState, data: FormData): Promise<FormState> {
  const email = text(data, "email", 120).toLowerCase();
  const done: FormState = { ok: "If that email has an account, a reset link is on its way.", fields: { email } };
  if (!supabaseReady()) return OFFLINE;
  if (!EMAIL.test(email)) return { error: "That email doesn't look usable.", fields: { email } };
  if ((await limited(`forgot-ip:${await clientIp()}`, 10, 60 * 60_000)) || (await limited(`forgot:${email}`, 3, 60 * 60_000))) {
    return done;
  }
  if (emailReady()) {
    const link = await authLink("recovery", email);
    // Unknown email: say the same thing, send nothing.
    if ("url" in link) {
      await sendMail({
        to: email,
        subject: "Reset your LiftPage password",
        lines: ["Someone asked to reset the password on this LiftPage account.", "The link works once and expires in an hour. If it wasn't you, ignore this."],
        action: { label: "Set a new password", url: link.url },
      });
    }
  } else {
    // No Resend: Supabase sends its own email. Same browser only (PKCE).
    await (await authClient()).auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/confirm?next=/auth/password` });
  }
  return done;
}
