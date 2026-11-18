"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { EMAIL, findUserByEmail, newUser, signupOpen, updateAccounts } from "@/lib/accounts";
import { endSession, requireUser, safeNext, startSession } from "@/lib/dal";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { clearLimit, limited } from "@/lib/rate";

/** `fields` echoes what was typed, so React's post-action form reset doesn't wipe it. */
export type FormState = { error?: string; ok?: string; fields?: Record<string, string> } | undefined;

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function clientIp(): Promise<string> {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "local";
}

export async function login(_: FormState, data: FormData): Promise<FormState> {
  const result = await tryLogin(data);
  return { ...result, fields: { email: text(data, "email", 120) } };
}

async function tryLogin(data: FormData): Promise<FormState> {
  const email = text(data, "email", 120).toLowerCase();
  const password = typeof data.get("password") === "string" ? (data.get("password") as string) : "";
  const ip = await clientIp();
  const key = `login:${email}`;
  if (limited(`login-ip:${ip}`, 30, 15 * 60_000) || limited(key, 8, 15 * 60_000)) {
    return { error: "Too many tries. Wait fifteen minutes." };
  }
  if (!email || !password) return { error: "Email and password both." };

  const user = await findUserByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) return { error: "That email and password don't match." };
  if (user.disabled) return { error: "This account is switched off. Ask LiftPage." };

  clearLimit(key);
  await updateAccounts((file) => {
    const row = file.users.find((item) => item.id === user.id);
    if (row) row.lastLoginAt = new Date().toISOString();
  });
  await startSession(user);
  redirect(safeNext(data.get("next"), user.role === "admin" ? "/admin" : "/account"));
}

export async function signup(_: FormState, data: FormData): Promise<FormState> {
  const result = await trySignup(data);
  return { ...result, fields: { name: text(data, "name", 80), company: text(data, "company", 80), email: text(data, "email", 120) } };
}

async function trySignup(data: FormData): Promise<FormState> {
  if (!signupOpen()) return { error: "Sign-up is closed. Ask LiftPage for an account." };
  if (limited(`signup:${await clientIp()}`, 5, 60 * 60_000)) {
    return { error: "Too many accounts from here. Try again later." };
  }
  const name = text(data, "name", 80);
  const company = text(data, "company", 80);
  const email = text(data, "email", 120).toLowerCase();
  const password = typeof data.get("password") === "string" ? (data.get("password") as string) : "";
  if (!name || !company) return { error: "Name and company both need a line." };
  if (!EMAIL.test(email)) return { error: "That email doesn't look usable." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const passwordHash = await hashPassword(password);
  const user = await updateAccounts((file) => {
    if (file.users.some((item) => item.email === email)) return null;
    const created = newUser({ email, name, company, role: "client", passwordHash });
    file.users.push(created);
    return created;
  });
  if (!user) return { error: "That email already has an account. Sign in instead." };
  await startSession(user);
  redirect("/account");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function changePassword(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = typeof data.get("current") === "string" ? (data.get("current") as string) : "";
  const next = typeof data.get("password") === "string" ? (data.get("password") as string) : "";
  if (limited(`pw:${user.id}`, 8, 15 * 60_000)) return { error: "Too many tries. Wait fifteen minutes." };
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Current password is wrong." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  const passwordHash = await hashPassword(next);
  const updated = await updateAccounts((file) => {
    const row = file.users.find((item) => item.id === user.id);
    if (!row) return null;
    row.passwordHash = passwordHash;
    // Signs out every other device.
    row.sessionVersion += 1;
    return { ...row };
  });
  if (!updated) return { error: "Account not found." };
  await startSession(updated);
  return { ok: "Password changed. Other devices are signed out." };
}
