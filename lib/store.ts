import "server-only";
import { randomUUID } from "node:crypto";
import { nid } from "./id";
import { seedDesk } from "./seed";
import { connectablePlatforms } from "./social/providers";
import { db, must } from "./supabase/server";
import type {
  BoardSummary,
  Brand,
  Connection,
  DeskFile,
  Hold,
  NoteKind,
  Platform,
  Post,
  PostNote,
  Role,
  Run,
  Status,
} from "./types";

type Row = Record<string, unknown>;

export const MEDIA_BUCKET = "post-media";

const opt = <T>(value: unknown) => (value === null || value === undefined ? undefined : (value as T));

function toBrand(row: Row): Brand {
  return {
    id: row.id as string,
    clientId: opt<string>(row.client_id),
    name: row.name as string,
    handle: row.handle as string,
    voice: row.voice as string,
    offers: row.offers as string,
    platforms: (row.platforms as Platform[]) ?? [],
  };
}

function toNote(row: Row): PostNote {
  return {
    id: row.id as string,
    postId: row.post_id as string,
    authorId: opt<string>(row.author_id),
    authorName: (row.author_name as string) || "",
    role: row.role as Role,
    kind: row.kind as NoteKind,
    text: row.text as string,
    at: row.at as string,
  };
}

export function mediaUrl(path: string): string {
  return db().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

function toPost(row: Row): Post {
  const notes = ((row.post_notes as Row[] | undefined) ?? []).map(toNote).sort((a, b) => a.at.localeCompare(b.at));
  return {
    id: row.id as string,
    platform: row.platform as Platform,
    slot: row.slot as string,
    hook: row.hook as string,
    caption: row.caption as string,
    visual: row.visual as string,
    reply: row.reply as string,
    status: row.status as Status,
    mediaUrl: row.media_path ? mediaUrl(row.media_path as string) : undefined,
    mediaType: opt<string>(row.media_type),
    publishState: row.publish_state as Post["publishState"],
    publishError: opt<string>(row.publish_error),
    publishedUrl: opt<string>(row.published_url),
    publishedAt: opt<string>(row.published_at),
    notes,
  };
}

function toRun(row: Row): Run {
  return {
    id: row.id as string,
    at: row.at as string,
    brief: row.brief as string,
    via: row.via as Run["via"],
    note: row.note as string,
    postIds: (row.post_ids as string[]) ?? [],
  };
}

export function toHold(row: Row): Hold {
  return {
    id: row.id as string,
    at: row.at as string,
    name: row.name as string,
    email: row.email as string,
    company: row.company as string,
    packageId: row.package_id as Hold["packageId"],
    brandId: (row.brand_id as string) ?? "",
    amount: Number(row.amount),
    status: row.status as Hold["status"],
    userId: opt<string>(row.user_id),
    note: opt<string>(row.note),
    amountPaid: row.amount_paid == null ? undefined : Number(row.amount_paid),
    paidAt: opt<string>(row.paid_at),
    invoiced: Boolean(row.stripe_invoice_id),
    brief: (row.brief as string | null) || undefined,
  };
}

function postRow(brandId: string, post: Pick<Post, "id" | "platform" | "slot" | "hook" | "caption" | "visual" | "reply" | "status">) {
  return {
    id: post.id,
    brand_id: brandId,
    platform: post.platform,
    slot: post.slot,
    hook: post.hook,
    caption: post.caption,
    visual: post.visual,
    reply: post.reply,
    status: post.status,
  };
}

function runRow(brandId: string, run: Run) {
  return { id: run.id, brand_id: brandId, at: run.at, brief: run.brief, via: run.via, note: run.note, post_ids: run.postIds };
}

let seeding: Promise<void> | undefined;

/** Writes the house board once, the first time the database has no boards. */
function ensureSeed(): Promise<void> {
  seeding ??= (async () => {
    const { count, error } = await db().from("brands").select("id", { count: "exact", head: true });
    if (error) throw new Error(`count boards: ${error.message}`);
    if (count) return;
    const seed = seedDesk();
    const b = seed.brand;
    must(
      await db()
        .from("brands")
        .upsert({ id: b.id, name: b.name, handle: b.handle, voice: b.voice, offers: b.offers, platforms: b.platforms }, { ignoreDuplicates: true }),
      "seed board",
    );
    must(await db().from("posts").upsert(seed.posts.map((p) => postRow(b.id, p)), { ignoreDuplicates: true }), "seed posts");
    must(await db().from("runs").upsert(seed.runs.map((r) => runRow(b.id, r)), { ignoreDuplicates: true }), "seed runs");
  })();
  seeding.catch(() => {
    seeding = undefined;
  });
  return seeding;
}

export async function listBoards(): Promise<BoardSummary[]> {
  await ensureSeed();
  const rows = must(
    await db().from("brands").select("id, name, client_id, client:profiles(company)").order("created_at"),
    "list boards",
  ) as Row[];
  return rows.map((row) => {
    const client = row.client as { company?: string } | { company?: string }[] | null;
    const company = Array.isArray(client) ? client[0]?.company : client?.company;
    return { id: row.id as string, name: row.name as string, clientId: opt<string>(row.client_id), company: company || undefined };
  });
}

async function postsFor(brandId: string): Promise<Post[]> {
  const rows = must(
    await db().from("posts").select("*, post_notes(*)").eq("brand_id", brandId).order("slot"),
    "load posts",
  ) as Row[];
  return rows.map(toPost);
}

export async function loadBrand(id: string): Promise<Brand | null> {
  const row = must(await db().from("brands").select("*").eq("id", id).maybeSingle(), "load board");
  return row ? toBrand(row) : null;
}

export async function connectionsFor(brandId: string): Promise<Connection[]> {
  const rows = must(
    await db().from("social_accounts").select("platform, account_name, connected_at, expires_at").eq("brand_id", brandId),
    "load connections",
  ) as Row[];
  return rows.map((row) => ({
    platform: row.platform as Platform,
    accountName: row.account_name as string,
    connectedAt: row.connected_at as string,
    expiresAt: opt<string>(row.expires_at),
  }));
}

/** The desk for one board. Without an id, or with an unknown one, the house board. */
export async function loadDesk(boardId?: string): Promise<DeskFile> {
  const boards = await listBoards();
  const chosen = boards.find((b) => b.id === boardId) ?? boards.find((b) => !b.clientId) ?? boards[0];
  if (!chosen) throw new Error("No boards. The seed didn't run.");
  const [brand, posts, runs, holds, connections] = await Promise.all([
    loadBrand(chosen.id),
    postsFor(chosen.id),
    db().from("runs").select("*").eq("brand_id", chosen.id).order("at", { ascending: false }).limit(40),
    db().from("holds").select("*").order("at", { ascending: false }).limit(1000),
    connectionsFor(chosen.id),
  ]);
  if (!brand) throw new Error("That board vanished mid-load.");
  return {
    brand,
    boards,
    posts,
    runs: (must(runs, "load runs") as Row[]).map(toRun),
    holds: (must(holds, "load requests") as Row[]).map(toHold),
    connections,
    connectable: connectablePlatforms(),
  };
}

/** A client's own board, for /account. Null until LiftPage opens one. */
export async function boardForClient(userId: string): Promise<{ brand: Brand; posts: Post[] } | null> {
  const row = must(await db().from("brands").select("*").eq("client_id", userId).maybeSingle(), "load client board");
  if (!row) return null;
  const brand = toBrand(row);
  return { brand, posts: await postsFor(brand.id) };
}

export async function createBoard(input: Omit<Brand, "id">): Promise<{ id: string } | { error: string }> {
  const id = nid("brand");
  const { error } = await db()
    .from("brands")
    .insert({
      id,
      client_id: input.clientId ?? null,
      name: input.name,
      handle: input.handle,
      voice: input.voice,
      offers: input.offers,
      platforms: input.platforms,
    });
  if (error) return { error: error.code === "23505" ? "That client already has a board." : error.message };
  return { id };
}

export async function updateBrand(id: string, patch: Partial<Pick<Brand, "voice" | "offers" | "platforms" | "name" | "handle">>) {
  must(await db().from("brands").update(patch).eq("id", id), "update board");
}

/** One post plus the board it sits on. */
export async function loadPost(id: string): Promise<{ post: Post; brandId: string; cueId?: string; mediaPath?: string } | null> {
  const row = must(await db().from("posts").select("*, post_notes(*)").eq("id", id).maybeSingle(), "load post") as Row | null;
  if (!row) return null;
  return { post: toPost(row), brandId: row.brand_id as string, cueId: opt<string>(row.cue_id), mediaPath: opt<string>(row.media_path) };
}

export type PostPatch = Partial<{
  slot: string;
  hook: string;
  caption: string;
  visual: string;
  reply: string;
  status: Status;
  media_path: string | null;
  media_type: string | null;
  cue_id: string | null;
  publish_state: Post["publishState"];
  publish_error: string | null;
  published_url: string | null;
  published_at: string | null;
}>;

export async function updatePost(id: string, patch: PostPatch) {
  must(await db().from("posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id), "update post");
}

/**
 * Takes a post off the schedule: new status, no cue (so a sleeping job stands down), and
 * back to idle only if it is still just scheduled. A job that already took the publish
 * lock keeps it; overwriting "publishing" would let the line go out twice.
 */
export async function retireCue(id: string, status: Status) {
  const now = new Date().toISOString();
  must(await db().from("posts").update({ status, cue_id: null, updated_at: now }).eq("id", id), "retire cue");
  must(
    await db().from("posts").update({ publish_state: "idle", updated_at: now }).eq("id", id).eq("publish_state", "scheduled"),
    "unschedule",
  );
}

/**
 * Takes the publish lock: flips the post to "publishing" only if nobody else has. With a
 * cueId, only if the post is still on that cue. Returns false when another job owns it.
 */
export async function claimPublish(id: string, cueId?: string): Promise<boolean> {
  let query = db()
    .from("posts")
    .update({ publish_state: "publishing", publish_error: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("publish_state", ["idle", "scheduled", "failed"]);
  if (cueId) query = query.eq("cue_id", cueId).eq("status", "cued");
  const rows = must(await query.select("id"), "claim post") as Row[];
  return rows.length === 1;
}

export async function addRun(brandId: string, brief: string, cut: { posts: Post[]; via: Run["via"]; note: string }): Promise<Run> {
  const run: Run = { id: nid("run"), at: new Date().toISOString(), brief, via: cut.via, note: cut.note, postIds: cut.posts.map((p) => p.id) };
  must(await db().from("posts").insert(cut.posts.map((p) => postRow(brandId, p))), "save cut");
  must(await db().from("runs").insert(runRow(brandId, run)), "save run");
  return run;
}

export async function addNote(note: Omit<PostNote, "id" | "at">) {
  must(
    await db().from("post_notes").insert({
      post_id: note.postId,
      author_id: note.authorId ?? null,
      author_name: note.authorName,
      role: note.role,
      kind: note.kind,
      text: note.text,
    }),
    "save note",
  );
}

/* ---------- Requests ---------- */

export async function addHold(hold: Omit<Hold, "id" | "at" | "status">): Promise<Hold> {
  const row = must(
    await db()
      .from("holds")
      .insert({
        // A request id is enough to open checkout for it, so it gets the full 122 random bits.
        id: `hold_${randomUUID().replace(/-/g, "")}`,
        name: hold.name,
        email: hold.email,
        company: hold.company,
        package_id: hold.packageId,
        brand_id: hold.brandId || null,
        amount: hold.amount,
        user_id: hold.userId ?? null,
        ...(hold.brief ? { brief: hold.brief } : {}),
      })
      .select("*")
      .single(),
    "save request",
  );
  return toHold(row);
}

export async function loadHold(id: string): Promise<Hold | null> {
  const row = must(await db().from("holds").select("*").eq("id", id).maybeSingle(), "load request");
  return row ? toHold(row) : null;
}

export async function setHoldStatus(id: string, status: Hold["status"]) {
  must(await db().from("holds").update({ status }).eq("id", id), "set request status");
}

/** Re-prices an unpaid request (a quote for Event Launch, say). False if it's already paid. */
export async function setHoldAmount(id: string, amount: number): Promise<boolean> {
  const rows = must(
    await db().from("holds").update({ amount }).eq("id", id).is("paid_at", null).select("id"),
    "re-price request",
  ) as Row[];
  return rows.length === 1;
}

/** Remembers the Stripe invoice sent for an unpaid request. False if it's paid already. */
export async function setHoldInvoice(id: string, invoiceId: string): Promise<boolean> {
  const rows = must(
    await db().from("holds").update({ stripe_invoice_id: invoiceId }).eq("id", id).is("paid_at", null).select("id"),
    "record invoice",
  ) as Row[];
  return rows.length === 1;
}

export async function holdInvoiceId(id: string): Promise<string | null> {
  const row = must(await db().from("holds").select("stripe_invoice_id").eq("id", id).maybeSingle(), "load invoice id") as Row | null;
  return (row?.stripe_invoice_id as string | null | undefined) ?? null;
}

/** Links every unlinked request from this email to the account. */
export async function linkHolds(email: string, userId: string) {
  must(await db().from("holds").update({ user_id: userId }).eq("email", email).is("user_id", null), "link requests");
}

export async function holdsFor(userId: string): Promise<Hold[]> {
  const rows = must(await db().from("holds").select("*").eq("user_id", userId).order("at", { ascending: false }), "load requests") as Row[];
  return rows.map(toHold);
}
