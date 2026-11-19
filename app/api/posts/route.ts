import { setPostStatus } from "@/lib/cue";
import { adminOrResponse } from "@/lib/dal";
import { loadDesk, loadPost, updatePost, type PostPatch } from "@/lib/store";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = new Set<Status>(["draft", "approved", "cued"]);
const MEDIA = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max);
}

export async function PATCH(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send the post." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const found = id ? await loadPost(id) : null;
  if (!found) return Response.json({ error: "That post is not on the board." }, { status: 404 });

  const patch: PostPatch = {};
  const hook = clip(body.hook, 160);
  const caption = clip(body.caption, 2200);
  const visual = clip(body.visual, 400);
  const reply = clip(body.reply, 400);
  if (hook !== undefined) patch.hook = hook;
  if (caption !== undefined) patch.caption = caption;
  if (visual !== undefined) patch.visual = visual;
  if (reply !== undefined) patch.reply = reply;
  if (body.mediaPath === null) {
    patch.media_path = null;
    patch.media_type = null;
  } else if (typeof body.mediaPath === "string") {
    // Only a file uploaded for this post, through /api/media.
    if (!body.mediaPath.startsWith(`posts/${id}/`) || body.mediaPath.includes("..")) {
      return Response.json({ error: "That file isn't this post's." }, { status: 400 });
    }
    const type = typeof body.mediaType === "string" && MEDIA.test(body.mediaType) ? body.mediaType : null;
    if (!type) return Response.json({ error: "Images (JPEG, PNG, WebP, GIF) or video (MP4, MOV, WebM)." }, { status: 400 });
    patch.media_path = body.mediaPath;
    patch.media_type = type;
  }
  if (Object.keys(patch).length) await updatePost(id, patch);

  let notice: string | undefined;
  if (typeof body.status === "string" && STATUSES.has(body.status as Status)) {
    const result = await setPostStatus(id, body.status as Status);
    if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
    notice = result.note;
  }
  return Response.json({ desk: await loadDesk(found.brandId), notice });
}
