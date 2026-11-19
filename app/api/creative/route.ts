import { logEvent } from "@/lib/admin";
import { CREATIVE_KINDS, makeCreative, type CreativeKind } from "@/lib/creative-store";
import { adminOrResponse } from "@/lib/dal";
import { limited } from "@/lib/rate";
import { loadBrand } from "@/lib/store";
import { PLATFORMS, type Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Writes a carousel or a short-form video script for a board. Admins only; nothing is posted. */
export async function POST(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  let body: { brandId?: unknown; kind?: unknown; brief?: unknown; platform?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send a brief." }, { status: 400 });
  }
  const kind = body.kind as CreativeKind;
  if (!CREATIVE_KINDS.includes(kind)) return Response.json({ error: "Pick a carousel or a video script." }, { status: 400 });
  const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 4000) : "";
  if (brief.length < 10) return Response.json({ error: "Say a little more in the brief." }, { status: 400 });
  const platform = PLATFORMS.includes(body.platform as Platform) ? (body.platform as Platform) : undefined;
  const brand = typeof body.brandId === "string" ? await loadBrand(body.brandId) : null;
  if (!brand) return Response.json({ error: "Pick a board." }, { status: 404 });
  if (await limited(`creative:${admin.id}`, 40, 3_600_000)) return Response.json({ error: "That's a lot this hour. Wait a while." }, { status: 429 });
  const made = await makeCreative({ brand, kind, brief, platform });
  if ("error" in made) return Response.json({ error: made.error }, { status: 502 });
  await logEvent(admin, `made ${kind}`, brand.clientId, made.title);
  return Response.json({ creative: made });
}
