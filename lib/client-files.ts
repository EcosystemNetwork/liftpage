import "server-only";
import { db, must } from "./supabase/server";
import { SETUP_PLATFORMS, type ClientPhoto, type SetupAsk, type SetupPlatform, type SocialSetup } from "./types";

type Row = Record<string, unknown>;

/*
 * What a client hands over from their account: photos, and where their social accounts
 * stand. Server only; callers check who is asking (lib/dal.ts) before they get here.
 */

export const PHOTO_BUCKET = "client-photos";
export const PHOTO_MAX = 25 * 1024 * 1024;
export const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};
/** Signed read links last an hour: long enough for a session, short enough to not leak far. */
const READ_SECONDS = 60 * 60;

/** Every client's photos live under their own folder; the path proves whose a file is. */
export const photoFolder = (clientId: string) => `clients/${clientId}/`;

export function ownsPath(clientId: string, path: string): boolean {
  const folder = photoFolder(clientId);
  return path.startsWith(folder) && /^[0-9a-f-]{36}\.[a-z]{3,4}$/.test(path.slice(folder.length));
}

/** Newest first, with signed links. Before the migration runs this is an empty list. */
export async function listPhotos(clientId: string, limit = 120): Promise<ClientPhoto[]> {
  const { data, error } = await db().from("client_photos").select("*").eq("client_id", clientId).order("at", { ascending: false }).limit(limit);
  if (error) {
    console.error("list photos", error.message);
    return [];
  }
  const rows = (data ?? []) as Row[];
  if (!rows.length) return [];
  const signed = await db()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.path as string),
      READ_SECONDS,
    );
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((row) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    url: urls.get(row.path as string) ?? "",
    type: row.type as string,
    size: row.size as number,
    caption: (row.caption as string) ?? "",
    at: row.at as string,
  }));
}

/** True when the upload actually landed in storage, so a row never points at nothing. */
export async function photoUploaded(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const { data, error } = await db()
    .storage.from(PHOTO_BUCKET)
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  return !error && (data ?? []).some((f) => f.name === path.slice(slash + 1));
}

export async function recordPhoto(input: { clientId: string; authorId: string; path: string; type: string; size: number; caption: string }) {
  must(
    await db().from("client_photos").upsert(
      { client_id: input.clientId, author_id: input.authorId, path: input.path, type: input.type, size: input.size, caption: input.caption },
      { onConflict: "path", ignoreDuplicates: true },
    ),
    "save photo",
  );
}

export async function countPhotos(clientId: string): Promise<number> {
  const { count } = await db().from("client_photos").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  return count ?? 0;
}

/** Returns the photo's client, or null when it's gone or isn't theirs. */
export async function captionPhoto(id: string, clientId: string | null, caption: string): Promise<string | null> {
  let query = db().from("client_photos").update({ caption }).eq("id", id);
  if (clientId) query = query.eq("client_id", clientId);
  const rows = must(await query.select("client_id"), "caption photo") as Row[];
  return (rows[0]?.client_id as string | undefined) ?? null;
}

export async function deletePhoto(id: string, clientId: string | null): Promise<string | null> {
  let query = db().from("client_photos").delete().eq("id", id);
  if (clientId) query = query.eq("client_id", clientId);
  const rows = must(await query.select("client_id, path"), "delete photo") as Row[];
  const row = rows[0];
  if (!row) return null;
  const { error } = await db().storage.from(PHOTO_BUCKET).remove([row.path as string]);
  // The row is gone, so the client no longer sees it; an orphaned file is only storage.
  if (error) console.error("remove photo file", error.message);
  return row.client_id as string;
}

/* ---------- Social account setup ---------- */

/** One entry per network, in display order. Networks the client hasn't answered are missing. */
export async function loadSetup(clientId: string): Promise<SocialSetup[]> {
  const { data, error } = await db().from("social_setup").select("*").eq("client_id", clientId);
  if (error) {
    console.error("load social setup", error.message);
    return [];
  }
  const order = (p: string) => SETUP_PLATFORMS.indexOf(p as SetupPlatform);
  return ((data ?? []) as Row[])
    .map((row) => ({
      platform: row.platform as SetupPlatform,
      ask: row.ask as SetupAsk,
      handle: (row.handle as string) ?? "",
      note: (row.note as string) ?? "",
      status: row.status as SocialSetup["status"],
      updatedAt: row.updated_at as string,
    }))
    .sort((a, b) => order(a.platform) - order(b.platform));
}

export type SetupInput = { platform: SetupPlatform; ask: SetupAsk; handle: string; note: string };

/**
 * Saves what the client said. A row whose answer changed goes back to open; one that
 * didn't keeps its status, so re-saving the form doesn't undo LiftPage's work.
 */
export async function saveSetup(clientId: string, rows: SetupInput[], before: SocialSetup[]): Promise<SetupInput[]> {
  const prior = new Map(before.map((s) => [s.platform, s]));
  const changed = rows.filter((r) => {
    const was = prior.get(r.platform);
    return !was || was.ask !== r.ask || was.handle !== r.handle || was.note !== r.note;
  });
  if (!changed.length) return [];
  const now = new Date().toISOString();
  must(
    await db()
      .from("social_setup")
      .upsert(
        changed.map((r) => ({ client_id: clientId, platform: r.platform, ask: r.ask, handle: r.handle, note: r.note, status: r.ask === "skip" ? "done" : "open", updated_at: now })),
        { onConflict: "client_id,platform" },
      ),
    "save social setup",
  );
  return changed;
}

/** LiftPage marks a network handled, and records the handle of an account it made. */
export async function finishSetup(clientId: string, platform: SetupPlatform, status: "open" | "done", handle?: string) {
  const patch: Record<string, string> = { status, updated_at: new Date().toISOString() };
  if (handle !== undefined) patch.handle = handle;
  must(await db().from("social_setup").update(patch).eq("client_id", clientId).eq("platform", platform), "finish social setup");
}
