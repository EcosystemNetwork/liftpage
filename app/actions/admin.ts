"use server";

import { revalidatePath } from "next/cache";
import { EMAIL, newUser, updateAccounts } from "@/lib/accounts";
import { requireAdmin } from "@/lib/dal";
import { hashPassword, tempPassword } from "@/lib/password";
import { loadDesk, updateDesk } from "@/lib/store";
import { HOLD_STATUSES, type HoldStatus, type Role } from "@/lib/types";
import type { FormState } from "./auth";

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function role(value: string): Role | null {
  return value === "admin" || value === "client" ? value : null;
}

function refresh() {
  revalidatePath("/admin", "layout");
}

export async function createUser(_: FormState, data: FormData): Promise<FormState> {
  const result = await tryCreate(data);
  if (!result?.error) return result;
  return { ...result, fields: { name: text(data, "name", 80), company: text(data, "company", 80), email: text(data, "email", 120), role: text(data, "role", 10) } };
}

async function tryCreate(data: FormData): Promise<FormState> {
  await requireAdmin();
  const email = text(data, "email", 120).toLowerCase();
  const name = text(data, "name", 80);
  const company = text(data, "company", 80);
  const as = role(text(data, "role", 10)) ?? "client";
  if (!name || !company) return { error: "Name and company both need a line." };
  if (!EMAIL.test(email)) return { error: "That email doesn't look usable." };

  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  const made = await updateAccounts((file) => {
    if (file.users.some((user) => user.email === email)) return false;
    file.users.push(newUser({ email, name, company, role: as, passwordHash }));
    return true;
  });
  if (!made) return { error: "That email already has an account." };
  refresh();
  return { ok: `Made ${email}. Temporary password: ${password} — send it privately. It is not shown again.` };
}

/** Turns a pilot request into a client account and links every request from that email. */
export async function accountFromHold(_: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const holdId = text(data, "holdId", 40);
  const hold = (await loadDesk()).holds.find((item) => item.id === holdId);
  if (!hold) return { error: "That request is gone." };

  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  const result = await updateAccounts((file) => {
    const existing = file.users.find((user) => user.email === hold.email);
    if (existing) return { id: existing.id, made: false };
    const user = newUser({ email: hold.email, name: hold.name, company: hold.company, role: "client", passwordHash });
    file.users.push(user);
    return { id: user.id, made: true };
  });
  await updateDesk((desk) => {
    for (const item of desk.holds) if (item.email === hold.email && !item.userId) item.userId = result.id;
  });
  refresh();
  return result.made
    ? { ok: `Made ${hold.email}. Temporary password: ${password} — send it privately. It is not shown again.` }
    : { ok: `${hold.email} already had an account. Linked the request to it.` };
}

export async function setHoldStatus(data: FormData) {
  await requireAdmin();
  const id = text(data, "holdId", 40);
  const status = text(data, "status", 20) as HoldStatus;
  if (!HOLD_STATUSES.includes(status)) return;
  await updateDesk((desk) => {
    const hold = desk.holds.find((item) => item.id === id);
    if (hold) hold.status = status;
  });
  refresh();
}

export async function setRole(data: FormData) {
  const me = await requireAdmin();
  const id = text(data, "userId", 40);
  const next = role(text(data, "role", 10));
  if (!next || id === me.id) return;
  await updateAccounts((file) => {
    const user = file.users.find((item) => item.id === id);
    if (!user) return;
    user.role = next;
    user.sessionVersion += 1;
  });
  refresh();
}

export async function setDisabled(data: FormData) {
  const me = await requireAdmin();
  const id = text(data, "userId", 40);
  const disabled = text(data, "disabled", 5) === "true";
  if (id === me.id) return;
  await updateAccounts((file) => {
    const user = file.users.find((item) => item.id === id);
    if (!user) return;
    user.disabled = disabled;
    user.sessionVersion += 1;
  });
  refresh();
}

export async function resetPassword(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const id = text(data, "userId", 40);
  if (id === me.id) return { error: "Change your own password from Account." };
  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  const email = await updateAccounts((file) => {
    const user = file.users.find((item) => item.id === id);
    if (!user) return null;
    user.passwordHash = passwordHash;
    user.sessionVersion += 1;
    return user.email;
  });
  if (!email) return { error: "That account is gone." };
  refresh();
  return { ok: `New temporary password for ${email}: ${password}` };
}
