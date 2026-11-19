"use server";

import { revalidatePath } from "next/cache";
import { authLink, EMAIL, findUser, findUserByEmail, setDisabled as switchAccount, setProfile } from "@/lib/accounts";
import { logEvent } from "@/lib/admin";
import { requireAdmin } from "@/lib/dal";
import { emailReady, sendMail } from "@/lib/email";
import { linkHolds, loadHold, setHoldAmount as saveHoldAmount, setHoldStatus as saveHoldStatus } from "@/lib/store";
import { HOLD_STATUSES, type HoldStatus } from "@/lib/types";
import type { FormState } from "./auth";

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function refresh() {
  revalidatePath("/admin", "layout");
}

/**
 * Emails the link when Resend is set up. Otherwise hands it to the admin to pass on,
 * which is still better than a password: it works once and expires.
 */
async function deliver(kind: "invite" | "recovery", email: string, url: string, name?: string): Promise<string> {
  const sent = await sendMail(
    kind === "invite"
      ? {
          to: email,
          subject: "Your LiftPage account",
          lines: [`${name ? `${name}, y` : "Y"}ou have a LiftPage account. Set a password to see your requests, your board, and your numbers.`, "The link works once."],
          action: { label: "Set your password", url },
        }
      : {
          to: email,
          subject: "Reset your LiftPage password",
          lines: ["LiftPage reset the password on your account. Set a new one with this link.", "The link works once."],
          action: { label: "Set a new password", url },
        },
  ).catch((error) => {
    console.error("deliver", error);
    return false;
  });
  if (sent) return `Emailed ${email} a link to set a password.`;
  return `${emailReady() ? "The email didn't send." : "Email isn't set up."} Send ${email} this one-time link privately: ${url}`;
}

export async function createUser(_: FormState, data: FormData): Promise<FormState> {
  const result = await tryCreate(data);
  if (!result?.error) return result;
  return { ...result, fields: { name: text(data, "name", 80), company: text(data, "company", 80), email: text(data, "email", 120) } };
}

/** Client accounts only. Admin is the owner's alone (lib/owner.ts). */
async function tryCreate(data: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const email = text(data, "email", 120).toLowerCase();
  const name = text(data, "name", 80);
  const company = text(data, "company", 80);
  if (!name || !company) return { error: "Name and company both need a line." };
  if (!EMAIL.test(email)) return { error: "That email doesn't look usable." };
  if (await findUserByEmail(email)) return { error: "That email already has an account." };

  const link = await authLink("invite", email, { name, company });
  if ("error" in link) return { error: `The account didn't make it: ${link.error}` };
  // The trigger made the profile from the invite metadata; role is ours to set.
  await setProfile(link.userId, { name, company, role: "client" });
  await linkHolds(email, link.userId);
  await logEvent(me, "account made", link.userId, email);
  refresh();
  return { ok: `Made ${email}. ${await deliver("invite", email, link.url, name)}` };
}

/** Turns a campaign request into a client account and links every request from that email. */
export async function accountFromHold(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const hold = await loadHold(text(data, "holdId", 40));
  if (!hold) return { error: "That request is gone." };

  const existing = await findUserByEmail(hold.email);
  if (existing) {
    await linkHolds(hold.email, existing.id);
    refresh();
    return { ok: `${hold.email} already had an account. Linked the request to it.` };
  }
  const link = await authLink("invite", hold.email, { name: hold.name, company: hold.company });
  if ("error" in link) return { error: `The account didn't make it: ${link.error}` };
  await setProfile(link.userId, { name: hold.name, company: hold.company, role: "client" });
  await linkHolds(hold.email, link.userId);
  await logEvent(me, "account made", link.userId, `${hold.email}, from a request`);
  refresh();
  return { ok: `Made ${hold.email}. ${await deliver("invite", hold.email, link.url, hold.name)}` };
}

export async function setHoldStatus(data: FormData) {
  const me = await requireAdmin();
  const status = text(data, "status", 20) as HoldStatus;
  if (!HOLD_STATUSES.includes(status)) return;
  const hold = await loadHold(text(data, "holdId", 40));
  if (!hold || hold.status === status) return;
  await saveHoldStatus(hold.id, status);
  await logEvent(me, "request status", hold.userId, `${hold.company}: ${hold.status} → ${status}`);
  refresh();
}

/** Whole dollars. What the client's deposit button charges from now on. */
export async function setHoldAmount(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const raw = text(data, "amount", 12).replace(/[$,\s]/g, "");
  const amount = Number(raw);
  if (!/^\d+$/.test(raw) || amount < 50 || amount > 100_000) return { error: "Whole dollars, $50 to $100,000." };
  const holdId = text(data, "holdId", 40);
  if (!(await saveHoldAmount(holdId, amount))) return { error: "Already paid, or gone. Paid requests keep their price." };
  const hold = await loadHold(holdId);
  await logEvent(me, "request price", hold?.userId, `${hold?.company ?? holdId}: $${amount}`);
  refresh();
  return { ok: "Price set." };
}

export async function setDisabled(data: FormData) {
  const me = await requireAdmin();
  const id = text(data, "userId", 40);
  const user = await findUser(id);
  if (id === me.id || !user) return;
  const off = text(data, "disabled", 5) === "true";
  await switchAccount(id, off);
  await logEvent(me, off ? "switched off" : "switched on", user.role === "client" ? id : null, user.email);
  refresh();
}

export async function resetPassword(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const id = text(data, "userId", 40);
  if (id === me.id) return { error: "Change your own password from Account." };
  const user = await findUser(id);
  if (!user) return { error: "That account is gone." };
  const link = await authLink("recovery", user.email);
  if ("error" in link) return { error: `No reset link: ${link.error}` };
  await logEvent(me, "password reset", user.role === "client" ? id : null, user.email);
  return { ok: await deliver("recovery", user.email, link.url) };
}
