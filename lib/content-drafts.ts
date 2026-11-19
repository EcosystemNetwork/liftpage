import "server-only";
import { nid } from "./id";
import { db, must } from "./supabase/server";
import { PLATFORMS, type Platform } from "./types";

/*
 * Long-form pieces from the admin content studio, kept per board. Drafts only: nothing here
 * sends or publishes.
 */

export type ContentDraft = {
  id: string;
  brandId: string;
  format: string;
  title: string;
  brief: string;
  body: string;
  via: string;
  harness: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

export const DRAFT_LIMITS = { title: 160, brief: 6000, body: 40_000 } as const;

function toDraft(row: Row): ContentDraft {
  return {
    id: row.id as string,
    brandId: row.brand_id as string,
    format: row.format as string,
    title: (row.title as string) ?? "",
    brief: (row.brief as string) ?? "",
    body: (row.body as string) ?? "",
    via: (row.via as string) ?? "",
    harness: (row.harness as string) ?? "",
    model: (row.model as string) ?? "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** A title from the first non-empty line of the piece, for the saved list. */
export function titleFrom(body: string): string {
  const line = body
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s]+/, "").replace(/^(subject( line)?|headline)\s*:\s*/i, "").trim())
    .find((l) => l.length > 0);
  return (line ?? "Untitled").slice(0, DRAFT_LIMITS.title);
}

export async function listDrafts(opts: { brandId?: string; limit?: number } = {}): Promise<ContentDraft[]> {
  let query = db().from("content_drafts").select("*").order("updated_at", { ascending: false }).limit(opts.limit ?? 60);
  if (opts.brandId) query = query.eq("brand_id", opts.brandId);
  return (must(await query, "list drafts") as Row[]).map(toDraft);
}

export async function saveDraft(
  input: Pick<ContentDraft, "brandId" | "format" | "brief" | "body" | "via" | "harness" | "model"> & { title?: string },
  createdBy: string,
): Promise<ContentDraft> {
  const row = {
    id: nid("cd"),
    brand_id: input.brandId,
    format: input.format,
    title: (input.title?.trim() || titleFrom(input.body)).slice(0, DRAFT_LIMITS.title),
    brief: input.brief.slice(0, DRAFT_LIMITS.brief),
    body: input.body.slice(0, DRAFT_LIMITS.body),
    via: input.via.slice(0, 40),
    harness: input.harness.slice(0, 64),
    model: input.model.slice(0, 64),
    created_by: createdBy,
  };
  const saved = must(await db().from("content_drafts").insert(row).select("*").single(), "save draft") as Row;
  return toDraft(saved);
}

/** Returns null when there was no such draft. */
export async function updateDraft(id: string, patch: { body: string; title?: string }): Promise<ContentDraft | null> {
  const rows = must(
    await db()
      .from("content_drafts")
      .update({
        body: patch.body.slice(0, DRAFT_LIMITS.body),
        title: (patch.title?.trim() || titleFrom(patch.body)).slice(0, DRAFT_LIMITS.title),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*"),
    "update draft",
  ) as Row[];
  return rows[0] ? toDraft(rows[0]) : null;
}

export async function deleteDraft(id: string): Promise<boolean> {
  const rows = must(await db().from("content_drafts").delete().eq("id", id).select("id"), "delete draft") as Row[];
  return rows.length > 0;
}

/** Each board's networks, so the post generator can offer only the ones the board uses. */
export async function boardPlatforms(): Promise<Record<string, Platform[]>> {
  const rows = must(await db().from("brands").select("id, platforms"), "board platforms") as Row[];
  const known = new Set<string>(PLATFORMS);
  return Object.fromEntries(
    rows.map((row) => [row.id as string, ((row.platforms as string[]) ?? []).filter((p): p is Platform => known.has(p))]),
  );
}
