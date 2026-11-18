import { adminOrResponse } from "@/lib/dal";
import { publishPost } from "@/lib/social/publish";
import { loadDesk, loadPost } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Publish now, from the desk. Same lock as the scheduler, so it can't double-post. */
export async function POST(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  let body: { id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send the post." }, { status: 400 });
  }
  const found = typeof body.id === "string" ? await loadPost(body.id) : null;
  if (!found) return Response.json({ error: "That post is not on the board." }, { status: 404 });
  if (found.post.status !== "approved" && found.post.status !== "cued") {
    return Response.json({ error: "Approve the line before it goes out." }, { status: 409 });
  }
  const result = await publishPost(found.post.id);
  const desk = await loadDesk(found.brandId);
  if (!result.ok) return Response.json({ error: result.error, desk }, { status: result.skipped ? 409 : 502 });
  return Response.json({ desk, notice: result.note ?? "Published." });
}
