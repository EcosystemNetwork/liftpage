"use server";

import { revalidatePath } from "next/cache";
import { findUser } from "@/lib/accounts";
import { requireUser } from "@/lib/dal";
import { readMetricCsv, upsertMetrics } from "@/lib/metrics";
import { db, must } from "@/lib/supabase/server";
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

async function isClient(userId: string): Promise<boolean> {
  const owner = await findUser(userId);
  return Boolean(owner && owner.role === "client");
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

  if (!(await isClient(userId))) return { error: "Numbers go on a client account." };
  await upsertMetrics([{ userId, week, platform, ...values }], me.id, "manual");
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  return { ok: "Saved." };
}

export async function deleteMetric(data: FormData) {
  const me = await requireUser();
  const id = typeof data.get("id") === "string" ? (data.get("id") as string) : "";
  if (!id) return;
  let query = db().from("metrics").delete().eq("id", id);
  // Clients only ever delete their own rows.
  if (me.role !== "admin") query = query.eq("user_id", me.id);
  must(await query, "delete metric");
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
}

// Under the 1 MB Server Action body limit, with room for the multipart envelope.
const MAX_CSV_BYTES = 900_000;

/** Bulk weeks from a CSV: week,platform,followers,impressions,engagements,clicks,leads. */
export async function importCsv(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser();
  const asked = typeof data.get("userId") === "string" ? (data.get("userId") as string) : "";
  const userId = me.role === "admin" && asked ? asked : me.id;
  const file = data.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick a CSV file." };
  if (file.size > MAX_CSV_BYTES) return { error: "Keep the file under 900 KB." };

  const { rows, errors } = readMetricCsv(await file.text());
  if (rows.length === 0) return { error: errors.slice(0, 3).join(" ") || "No usable rows." };

  if (!(await isClient(userId))) return { error: "Numbers go on a client account." };
  await upsertMetrics(rows.map((row) => ({ userId, ...row })), me.id, "csv");
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  const skipped = errors.length ? ` Skipped ${errors.length}: ${errors.slice(0, 3).join(" ")}${errors.length > 3 ? " …" : ""}` : "";
  return { ok: `Imported ${rows.length} row${rows.length === 1 ? "" : "s"}.${skipped}` };
}
