import { aiCaller } from "@/lib/access";
import { logEvent } from "@/lib/admin";
import { cutWeek } from "@/lib/cut";
import { addRun, loadBrand, loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Cuts a week of drafts from a brief. Admins on any board; a client with "week" on their own. */
export async function POST(request: Request) {
  let body: { brief?: unknown; brandId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send a brief." }, { status: 400 });
  }
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 8) {
    return Response.json({ error: "The brief needs a real note. Eight characters at least." }, { status: 400 });
  }
  if (brief.length > 4000) {
    return Response.json({ error: "Keep the brief under 4,000 characters." }, { status: 400 });
  }
  const caller = await aiCaller("week");
  if (caller instanceof Response) return caller;
  const brandId = caller.boardId ?? (typeof body.brandId === "string" ? body.brandId : "");
  const brand = brandId ? await loadBrand(brandId) : null;
  if (!brand) return Response.json({ error: "Pick a board." }, { status: 404 });
  const cut = await cutWeek(brief, brand);
  await addRun(brand.id, brief, cut);
  if (caller.boardId) {
    await logEvent(caller.user, "client drafted week", caller.user.id, `${cut.posts.length} drafts via ${cut.via}`);
    return Response.json({ notice: `${cut.posts.length} drafts on your board. LiftPage reviews them before anything is scheduled.` });
  }
  return Response.json({ desk: await loadDesk(brand.id) });
}
