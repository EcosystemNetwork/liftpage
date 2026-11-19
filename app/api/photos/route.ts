import { randomUUID } from "node:crypto";
import { findUser } from "@/lib/accounts";
import { currentUser } from "@/lib/dal";
import { countPhotos, PHOTO_BUCKET, PHOTO_EXT, PHOTO_MAX, photoFolder } from "@/lib/client-files";
import { limited } from "@/lib/rate";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Most photos one client keeps with us. Past this they should clear out old ones. */
const LIBRARY_MAX = 500;

/**
 * Hands out a one-time signed URL to upload one photo straight to private storage, under the
 * client's own folder. A client uploads to their own library; an admin names the client.
 * The browser then confirms the upload with the savePhoto action, which records the row.
 */
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  let body: { type?: unknown; size?: unknown; clientId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send the file details." }, { status: 400 });
  }

  let clientId = me.id;
  if (me.role === "admin") {
    const asked = typeof body.clientId === "string" && /^[0-9a-f-]{36}$/i.test(body.clientId) ? await findUser(body.clientId) : undefined;
    if (!asked || asked.role !== "client") return Response.json({ error: "Photos go to client accounts." }, { status: 400 });
    clientId = asked.id;
  } else if (await limited(`photo-up:${me.id}`, 100, 60 * 60_000)) {
    return Response.json({ error: "That's a lot of photos in one hour. Give it a little while." }, { status: 429 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  const ext = PHOTO_EXT[type];
  if (!ext) return Response.json({ error: "Photos only: JPEG, PNG, WebP, GIF, or HEIC." }, { status: 400 });
  if (typeof body.size !== "number" || body.size <= 0 || body.size > PHOTO_MAX) {
    return Response.json({ error: "Keep each photo under 25 MB." }, { status: 400 });
  }
  if ((await countPhotos(clientId)) >= LIBRARY_MAX) {
    return Response.json({ error: `Your library holds ${LIBRARY_MAX} photos. Delete a few old ones first.` }, { status: 400 });
  }

  const path = `${photoFolder(clientId)}${randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("photo upload url", error?.message);
    return Response.json({ error: "Photo storage isn't answering. Try again in a minute." }, { status: 502 });
  }
  return Response.json({ path, signedUrl: data.signedUrl, type });
}
