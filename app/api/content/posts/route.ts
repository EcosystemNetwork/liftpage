import { aiCaller } from "@/lib/access";
import { logEvent } from "@/lib/admin";
import { cutWeek } from "@/lib/cut";
import { checkRoute, loadHarnessCatalog } from "@/lib/harness-catalog";
import { addRun, loadBrand } from "@/lib/store";
import { PLATFORMS, type Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Admin content studio: social posts from a brief, written by the picked backend, harness,
 * and model, saved onto the board as drafts. Nothing is approved or scheduled here. Unlike
 * the desk, a local fallback cut is refused: the admin asked for a model to write it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { brandId?: unknown; brief?: unknown; count?: unknown; platforms?: unknown; route?: unknown };
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 8) return Response.json({ error: "The brief needs a real note. Eight characters at least." }, { status: 400 });
  if (brief.length > 4000) return Response.json({ error: "Keep the brief under 4,000 characters." }, { status: 400 });
  const caller = await aiCaller("week");
  if (caller instanceof Response) return caller;
  if (caller.user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });

  const route = checkRoute(body.route, await loadHarnessCatalog());
  if ("error" in route) return Response.json({ error: route.error }, { status: 400 });
  const brand = typeof body.brandId === "string" ? await loadBrand(body.brandId) : null;
  if (!brand) return Response.json({ error: "Pick a board." }, { status: 404 });

  const asked = Array.isArray(body.platforms) ? body.platforms.filter((p): p is Platform => (PLATFORMS as readonly unknown[]).includes(p)) : [];
  const platforms = asked.length ? brand.platforms.filter((p) => asked.includes(p)) : brand.platforms;
  if (!platforms.length) return Response.json({ error: "Pick at least one of the board's networks." }, { status: 400 });
  const count = typeof body.count === "number" && Number.isFinite(body.count) ? body.count : 6;

  // One model pass: the second "tighten" pass can double the time past maxDuration.
  const cut = await cutWeek(brief, { ...brand, platforms }, { route, count, review: false });
  if (cut.via === "local") return Response.json({ error: `No model wrote the posts, so nothing was saved. ${cut.note}` }, { status: 502 });
  const run = await addRun(brand.id, brief, cut);
  await logEvent(caller.user, "generated posts", brand.clientId ?? null, `${cut.posts.length} drafts on ${brand.name} via ${cut.via}`);
  return Response.json({
    runId: run.id,
    via: cut.via,
    note: cut.note,
    posts: cut.posts.map((p) => ({ id: p.id, platform: p.platform, slot: p.slot, hook: p.hook, caption: p.caption, visual: p.visual, reply: p.reply })),
  });
}
