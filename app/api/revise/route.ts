import { aiCaller } from "@/lib/access";
import { logEvent } from "@/lib/admin";
import { revisePost } from "@/lib/cut";
import { addNote, loadBrand, loadDesk, loadPost, updatePost } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Redrafts one post against its review notes with the AI backends. The post ends up a draft,
 * so new words always need a fresh approval. Clients may redraft drafts on their own board.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { postId?: unknown; instruction?: unknown };
  const found = typeof body.postId === "string" ? await loadPost(body.postId) : null;
  if (!found) return Response.json({ error: "That post is not on the board." }, { status: 404 });
  const caller = await aiCaller("redraft");
  if (caller instanceof Response) return caller;
  const client = Boolean(caller.boardId);
  if (client && found.brandId !== caller.boardId) return Response.json({ error: "That post is not on the board." }, { status: 404 });
  const { post } = found;
  if (post.status === "cued" || post.publishState === "published" || post.publishState === "publishing") {
    return Response.json({ error: client ? "That post is already scheduled. Message LiftPage to change it." : "Take the post off the schedule before redrafting it." }, { status: 409 });
  }
  const brand = await loadBrand(found.brandId);
  if (!brand) return Response.json({ error: "The board is gone." }, { status: 404 });
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 600) : "";

  const result = await revisePost(post, brand, instruction);
  const fail = (error: string) => (client ? Response.json({ error }, { status: 502 }) : loadDesk(found.brandId).then((desk) => Response.json({ error, desk }, { status: 502 })));
  if ("error" in result) return fail(result.error);

  await updatePost(post.id, { ...result.revision, ...(post.status === "approved" ? { status: "draft" as const } : {}) });
  await addNote({
    postId: post.id,
    authorId: caller.user.id,
    authorName: caller.user.name || (client ? "Client" : "LiftPage"),
    role: caller.user.role,
    kind: "comment",
    text: client ? `Redrafted with AI${instruction ? `: ${instruction}` : "."}` : "Redrafted from the review notes. Have another look.",
  });
  if (client) {
    await logEvent(caller.user, "client redrafted", caller.user.id, post.id);
    return Response.json({ notice: "Redrafted. It's a draft again; approve it when it reads right." });
  }
  return Response.json({ desk: await loadDesk(found.brandId), notice: result.note });
}
