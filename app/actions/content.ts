"use server";

import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/admin";
import { deleteDraft, DRAFT_LIMITS, saveDraft, updateDraft, type ContentDraft } from "@/lib/content-drafts";
import { requireAdmin } from "@/lib/dal";
import { loadBrand } from "@/lib/store";
import { isFormat } from "@/lib/write";

/*
 * Saved pieces in the admin content studio. Called with plain arguments from the studio;
 * every one checks the admin role itself.
 */

type Result = { draft: ContentDraft } | { error: string };

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

export async function saveContentDraft(input: {
  brandId: unknown;
  format: unknown;
  brief: unknown;
  body: unknown;
  via: unknown;
  harness: unknown;
  model: unknown;
}): Promise<Result> {
  const admin = await requireAdmin("/admin/content");
  const body = str(input.body, DRAFT_LIMITS.body).trim();
  if (!body) return { error: "There is nothing to save yet." };
  if (!isFormat(input.format)) return { error: "Pick what was written." };
  const brand = typeof input.brandId === "string" ? await loadBrand(input.brandId) : null;
  if (!brand) return { error: "That board is gone." };
  try {
    const draft = await saveDraft(
      {
        brandId: brand.id,
        format: input.format,
        brief: str(input.brief, DRAFT_LIMITS.brief),
        body,
        via: str(input.via, 40),
        harness: str(input.harness, 64),
        model: str(input.model, 64),
      },
      admin.id,
    );
    await logEvent(admin, "saved content draft", brand.clientId ?? null, `${draft.title} (${brand.name})`);
    revalidatePath("/admin/content");
    return { draft };
  } catch (error) {
    console.error("save content draft", error);
    return { error: "Couldn't save the draft. Has the content_drafts migration been run?" };
  }
}

export async function updateContentDraft(id: unknown, body: unknown): Promise<Result> {
  await requireAdmin("/admin/content");
  const text = str(body, DRAFT_LIMITS.body).trim();
  if (typeof id !== "string" || !id) return { error: "Which draft?" };
  if (!text) return { error: "A saved draft can't be empty. Delete it instead." };
  try {
    const draft = await updateDraft(id, { body: text });
    if (!draft) return { error: "That draft is gone." };
    revalidatePath("/admin/content");
    return { draft };
  } catch (error) {
    console.error("update content draft", error);
    return { error: "Couldn't save the changes." };
  }
}

export async function deleteContentDraft(id: unknown): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin("/admin/content");
  if (typeof id !== "string" || !id) return { error: "Which draft?" };
  try {
    if (!(await deleteDraft(id))) return { error: "That draft is already gone." };
    await logEvent(admin, "deleted content draft", null, id);
    revalidatePath("/admin/content");
    return { ok: true };
  } catch (error) {
    console.error("delete content draft", error);
    return { error: "Couldn't delete the draft." };
  }
}
