import { adminOrResponse } from "@/lib/dal";
import { loadBrand, loadDesk, updateBrand } from "@/lib/store";
import { PLATFORMS, type Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  let body: { brandId?: unknown; voice?: unknown; offers?: unknown; platforms?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send the voice card." }, { status: 400 });
  }
  const brand = typeof body.brandId === "string" ? await loadBrand(body.brandId) : null;
  if (!brand) return Response.json({ error: "Pick a board." }, { status: 404 });
  const voice = typeof body.voice === "string" ? body.voice.trim().slice(0, 500) : "";
  const offers = typeof body.offers === "string" ? body.offers.trim().slice(0, 500) : "";
  if (voice.length < 8 || offers.length < 8) {
    return Response.json({ error: "Voice and offer both need a real line." }, { status: 400 });
  }
  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter((item): item is Platform => typeof item === "string" && PLATFORMS.includes(item as Platform))
    : [];
  await updateBrand(brand.id, { voice, offers, ...(platforms.length ? { platforms } : {}) });
  return Response.json({ desk: await loadDesk(brand.id) });
}
