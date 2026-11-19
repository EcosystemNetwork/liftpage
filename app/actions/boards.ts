"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { findUser } from "@/lib/accounts";
import { track } from "@/lib/analytics";
import { requireAdmin, requireUser } from "@/lib/dal";
import { enqueue } from "@/lib/inngest/client";
import { syncInsights } from "@/lib/social/insights";
import { addNote, boardForClient, createBoard, loadBrand, loadPost, retireCue, updatePost } from "@/lib/store";
import { notifyAddress, sendMail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
import { mailClientReview } from "@/lib/review-mail";
import { NOTE_KINDS, PLATFORMS, type NoteKind, type Platform } from "@/lib/types";
import type { FormState } from "./auth";

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Admin: opens a client's board and goes straight to it on the desk. */
export async function openBoard(_: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const clientId = text(data, "clientId", 40);
  const client = await findUser(clientId);
  if (!client || client.role !== "client") return { error: "Boards belong to client accounts." };
  const name = text(data, "name", 80) || client.company;
  const handle = text(data, "handle", 60);
  const voice = text(data, "voice", 500);
  const offers = text(data, "offers", 500);
  const platforms = data.getAll("platforms").filter((p): p is Platform => typeof p === "string" && PLATFORMS.includes(p as Platform));
  const fields = { name, handle, voice, offers };
  if (voice.length < 8 || offers.length < 8) return { error: "Voice and offer both need a real line.", fields };
  if (!platforms.length) return { error: "Pick at least one platform.", fields };
  const made = await createBoard({ clientId, name, handle, voice, offers, platforms });
  if ("error" in made) return { error: made.error, fields };
  redirect(`/desk?board=${made.id}`);
}

/**
 * Client review on their own board. Approve moves a draft to approved; changes sends any
 * unpublished line back to draft (and off the schedule) with a required note.
 */
export async function reviewPost(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser();
  const postId = text(data, "postId", 40);
  const kind = text(data, "kind", 10) as NoteKind;
  const note = text(data, "text", 1000);
  if (!NOTE_KINDS.includes(kind)) return { error: "Pick approve, changes, or comment." };
  const found = await loadPost(postId);
  const brand = found ? await loadBrand(found.brandId) : null;
  // Clients review only their own board. Admins use the desk.
  if (!found || !brand || brand.clientId !== me.id) return { error: "That post isn't on your board." };
  const { post } = found;

  if (kind === "approved") {
    if (post.status !== "draft") return { error: "Only drafts need approval." };
    await updatePost(postId, { status: "approved" });
  } else if (kind === "changes") {
    if (!note) return { error: "Say what should change." };
    if (post.publishState === "published" || post.publishState === "publishing") return { error: "That one already went out." };
    await retireCue(postId, "draft");
  } else if (!note) {
    return { error: "Write the comment first." };
  }
  await addNote({ postId, authorId: me.id, authorName: me.name || me.email, role: me.role, kind, text: note });
  await track(me.id, "post_reviewed", { kind });
  after(() => mailClientReview(post, found.brandId, kind, note, me.name || me.email));
  revalidatePath("/account");
  return { ok: kind === "approved" ? "Approved." : kind === "changes" ? "Sent back with your note." : "Comment saved." };
}

/**
 * Client: approves every draft on their own board in one go. Lines they sent back stay
 * drafts (they're waiting on LiftPage). LiftPage gets one email, not one per post.
 */
export async function approveAllMine(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser();
  if (me.role !== "client") return { error: "Admins approve on the desk." };
  const board = await boardForClient(me.id);
  const expected = Number(text(data, "count", 6));
  const drafts = (board?.posts ?? []).filter(
    (p) => p.status === "draft" && p.notes.at(-1)?.kind !== "changes" && p.publishState !== "published" && p.publishState !== "publishing",
  );
  if (!board || !drafts.length) return { error: "Nothing waiting for you." };
  // New drafts arrived since the page loaded: show them first rather than approve unseen posts.
  if (expected && drafts.length !== expected) {
    revalidatePath("/account");
    return { error: `There are ${drafts.length} drafts now, not ${expected}. Reload to see the new ones first.` };
  }
  for (const post of drafts) {
    await updatePost(post.id, { status: "approved" });
    await addNote({ postId: post.id, authorId: me.id, authorName: me.name || me.email, role: me.role, kind: "approved", text: "" });
  }
  await track(me.id, "post_reviewed", { kind: "approved", bulk: drafts.length });
  const to = notifyAddress();
  if (to) {
    after(() =>
      sendMail({
        to,
        subject: `${board.brand.name} approved ${drafts.length} ${drafts.length === 1 ? "post" : "posts"}`,
        lines: [`${me.name || me.email} approved everything waiting on their board. They're ready to schedule.`],
        action: { label: "Open the board", url: `${siteUrl()}/desk?board=${encodeURIComponent(board.brand.id)}` },
      }).catch((error) => console.error("approve all mail", error)),
    );
  }
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  return { ok: `Approved ${drafts.length} ${drafts.length === 1 ? "post" : "posts"}. We'll take it from here.` };
}

/** Pulls network numbers for a client now. Admins for anyone; clients for themselves. */
export async function syncNow(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser();
  const asked = text(data, "userId", 40);
  const userId = me.role === "admin" && asked ? asked : me.id;
  if (await enqueue("liftpage/insights.sync", { userId })) return { ok: "Sync started. Numbers land in a minute or two; reload to see them." };
  const report = await syncInsights(userId);
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  if (!report.length) return { error: "No networks are connected to this client's board yet." };
  return { ok: report.map((r) => `${r.platform}: ${r.ok ? "" : "failed, "}${r.note}`).join(" · ") };
}
