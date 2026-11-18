"use server";

import { revalidatePath } from "next/cache";
import { updateAccounts } from "@/lib/accounts";
import { requireUser } from "@/lib/dal";
import { nid } from "@/lib/id";
import { weekOf } from "@/lib/stats";
import { METRIC_FIELDS, PLATFORMS, type Platform } from "@/lib/types";
import type { FormState } from "./auth";

const MAX = 10_000_000_000;

function count(data: FormData, key: string): number | null {
  const raw = data.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return 0;
  const n = Number(raw.replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX) return null;
  return Math.round(n);
}

/** Records one week on one platform. Same week + platform overwrites. */
export async function saveMetric(_: FormState, data: FormData): Promise<FormState> {
  const result = await trySave(data);
  const fields: Record<string, string> = {};
  const keep = result?.error ? ["week", "platform", ...METRIC_FIELDS] : ["week", "platform"];
  for (const key of keep) {
    const value = data.get(key);
    if (typeof value === "string") fields[key] = value.slice(0, 40);
  }
  return { ...result, fields };
}

async function trySave(data: FormData): Promise<FormState> {
  const me = await requireUser();
  const asked = typeof data.get("userId") === "string" ? (data.get("userId") as string) : "";
  // Clients only ever write their own numbers, whatever the form says.
  const userId = me.role === "admin" && asked ? asked : me.id;

  const week = weekOf(typeof data.get("week") === "string" ? (data.get("week") as string) : "");
  if (!week) return { error: "Pick the week." };
  if (week > (weekOf(new Date()) ?? "")) return { error: "That week hasn't happened yet." };
  const platform = data.get("platform") as Platform;
  if (!PLATFORMS.includes(platform)) return { error: "Pick a platform." };

  const values = {} as Record<(typeof METRIC_FIELDS)[number], number>;
  for (const field of METRIC_FIELDS) {
    const n = count(data, field);
    if (n === null) return { error: `${field[0].toUpperCase()}${field.slice(1)} needs a whole number.` };
    values[field] = n;
  }
  if (values.engagements > values.impressions && values.impressions > 0) {
    return { error: "Engagements can't be more than impressions." };
  }

  const found = await updateAccounts((file) => {
    const owner = file.users.find((user) => user.id === userId);
    if (!owner || owner.role !== "client") return false;
    const at = new Date().toISOString();
    const existing = file.metrics.find((m) => m.userId === userId && m.week === week && m.platform === platform);
    if (existing) Object.assign(existing, values, { at, by: me.id });
    else file.metrics.push({ id: nid("met"), userId, week, platform, ...values, at, by: me.id });
    return true;
  });
  if (!found) return { error: "Numbers go on a client account." };
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  return { ok: "Saved." };
}

export async function deleteMetric(data: FormData) {
  const me = await requireUser();
  const id = typeof data.get("id") === "string" ? (data.get("id") as string) : "";
  await updateAccounts((file) => {
    const index = file.metrics.findIndex((m) => m.id === id && (me.role === "admin" || m.userId === me.id));
    if (index >= 0) file.metrics.splice(index, 1);
  });
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
}
