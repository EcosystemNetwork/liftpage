import { adminOrResponse } from "@/lib/dal";
import { updateDesk } from "@/lib/store";
import type { Post, Status } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = new Set<Status>(["draft", "approved", "cued"]);

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max);
}

export async function PATCH(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  let body: Partial<Post> & { id?: unknown };
  try {
    body = (await request.json()) as Partial<Post> & { id?: unknown };
  } catch {
    return Response.json({ error: "Send the post." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "Missing the post." }, { status: 400 });

  let missing = false;
  const desk = await updateDesk((current) => {
    const post = current.posts.find((item) => item.id === id);
    if (!post) {
      missing = true;
      return;
    }
    const hook = clip(body.hook, 160);
    const caption = clip(body.caption, 2000);
    const visual = clip(body.visual, 400);
    const reply = clip(body.reply, 400);
    if (hook !== undefined) post.hook = hook;
    if (caption !== undefined) post.caption = caption;
    if (visual !== undefined) post.visual = visual;
    if (reply !== undefined) post.reply = reply;
    if (typeof body.status === "string" && STATUSES.has(body.status)) post.status = body.status;
  });

  if (missing) return Response.json({ error: "That post is not on the board." }, { status: 404 });
  return Response.json({ desk });
}
