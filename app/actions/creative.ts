"use server";

import { revalidatePath } from "next/cache";
import { cleanKit } from "@/lib/creative";
import { deleteCreative, saveKit } from "@/lib/creative-store";
import { requireAdmin } from "@/lib/dal";
import { loadBrand } from "@/lib/store";

const field = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

export async function saveBrandKit(data: FormData) {
  await requireAdmin("/admin/creative");
  const brand = await loadBrand(field(data, "brandId"));
  if (!brand) return;
  await saveKit(
    brand.id,
    cleanKit({ background: field(data, "background"), text: field(data, "text"), accent: field(data, "accent"), font: field(data, "font"), signature: field(data, "signature") }),
  );
  revalidatePath("/admin/creative");
}

export async function removeCreative(data: FormData) {
  await requireAdmin("/admin/creative");
  await deleteCreative(field(data, "id"));
  revalidatePath("/admin/creative");
}
