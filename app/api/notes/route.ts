import { adminOrResponse } from "@/lib/dal";
import { addNote, loadDesk, loadPost } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** An admin's reply on a post, shown to the client next to their review. */
export async function POST(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const body = (await request.json().catch(() => ({}))) as { postId?: unknown; text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  const found = typeof body.postId === "string" ? await loadPost(body.postId) : null;
  if (!found) return Response.json({ error: "That post is not on the board." }, { status: 404 });
  if (!text) return Response.json({ error: "Write the note first." }, { status: 400 });
  await addNote({ postId: found.post.id, authorId: admin.id, authorName: admin.name || "LiftPage", role: "admin", kind: "comment", text });
  return Response.json({ desk: await loadDesk(found.brandId) });
}
