import { randomUUID } from "node:crypto";
import { adminOrResponse } from "@/lib/dal";
import { loadPost, MEDIA_BUCKET } from "@/lib/store";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
const MAX = 500 * 1024 * 1024;

/**
 * Hands the desk a one-time signed URL to upload straight to Supabase Storage, so big
 * videos never pass through this server. The desk then saves the path on the post.
 */
export async function POST(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  let body: { postId?: unknown; type?: unknown; size?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send the file details." }, { status: 400 });
  }
  const post = typeof body.postId === "string" ? await loadPost(body.postId) : null;
  if (!post) return Response.json({ error: "That post is not on the board." }, { status: 404 });
  const type = typeof body.type === "string" ? body.type : "";
  const ext = EXT[type];
  if (!ext) return Response.json({ error: "Images (JPEG, PNG, WebP, GIF) or video (MP4, MOV, WebM)." }, { status: 400 });
  if (typeof body.size !== "number" || body.size <= 0 || body.size > MAX) {
    return Response.json({ error: "Keep files under 500 MB." }, { status: 400 });
  }
  const path = `posts/${post.post.id}/${randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return Response.json({ error: `Storage said no: ${error?.message}` }, { status: 502 });
  return Response.json({ path, signedUrl: data.signedUrl, type });
}
