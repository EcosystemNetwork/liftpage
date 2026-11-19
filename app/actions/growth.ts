"use server";

import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/admin";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/attribution";
import { loadLead, rotateTrackKey, updateLead } from "@/lib/attribution-store";
import { requireAdmin } from "@/lib/dal";
import { loadBrand } from "@/lib/store";

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Makes the board's tracking key, or replaces it (the old snippet stops counting). */
export async function rotateKey(data: FormData) {
  const admin = await requireAdmin("/admin/growth");
  const brand = await loadBrand(text(data, "brandId", 80));
  if (!brand) return;
  await rotateTrackKey(brand.id);
  await logEvent(admin, "rotated track key", brand.clientId, brand.name);
  revalidatePath("/admin/growth");
}

/** Status, deal value (major units, blank to clear) and notes for one lead. */
export async function saveLead(data: FormData) {
  const admin = await requireAdmin("/admin/growth");
  const lead = await loadLead(text(data, "leadId", 80));
  if (!lead) return;
  const status = text(data, "status", 20) as LeadStatus;
  const rawValue = text(data, "value", 20).replace(/[,$\s]/g, "");
  const value = rawValue === "" ? null : Number(rawValue);
  const valueCents = value === null ? null : Number.isFinite(value) && value >= 0 && value < 1e9 ? Math.round(value * 100) : undefined;
  await updateLead(lead.id, {
    status: LEAD_STATUSES.includes(status) ? status : undefined,
    valueCents,
    notes: text(data, "notes", 4000),
  });
  if (status !== lead.status) {
    const brand = await loadBrand(lead.brandId);
    await logEvent(admin, `lead ${status}`, brand?.clientId, lead.email);
  }
  revalidatePath("/admin/growth");
}
